import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AzureChatOpenAI, AzureOpenAIEmbeddings } from "@langchain/openai";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

// import {PGVectorStore, type DistanceStrategy} from "@langchain/community/vectorstores/pgvector";

import {
  PGVectorStore,
  type DistanceStrategy,
} from "@langchain/community/vectorstores/pgvector";
import type { PoolConfig } from "pg";

// Global variables to store initialized components
let vectorStore: MemoryVectorStore | null = null;
let retrievalChain: any = null;
let isInitialized = false;

const endpoint = process.env["AZURE_OPENAI_ENDPOINT"] || "";
const apiKey = process.env["AZURE_OPENAI_API_KEY"] || "";
const apiVersion = process.env["AZURE_OPENAI_API_VERSION"] || "";
const deployment = process.env["AZURE_OPENAI_API_DEPLOYMENT_NAME"] || "";

import path from "path";
import fs from "fs/promises";
import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

async function loadDocumentsByCategory(basePath: string) {
  async function getAllFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map((entry) => {
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory() ? getAllFiles(fullPath) : fullPath;
      })
    );
    return files.flat();
  }

  const allFiles = await getAllFiles(basePath);
  const allDocs: Document[] = [];

  for (const file of allFiles) {
    let loader;

    if (file.endsWith(".txt")) {
      loader = new TextLoader(file);
    } else if (file.endsWith(".pdf")) {
      loader = new PDFLoader(file);
    } else {
      continue;
    }

    const docs = await loader.load();

    // เพิ่ม metadata ให้แต่ละ document
    for (const doc of docs) {
      const relativePath = path.relative(basePath, file);
      const category = path.dirname(relativePath).split(path.sep).join("/");

      doc.metadata = {
        ...doc.metadata,
        category,
        filename: path.basename(file),
      };
    }

    allDocs.push(...docs);
  }

  return allDocs;
}

export const getAnswer = async (
  retrievalChain: any,
  question: string,
  conversationHistory: Array<{ role: string; content: string }> = []
) => {
  try {
    // Format conversation history for the prompt
    const conversationContext =
      conversationHistory.length > 0
        ? conversationHistory
            .map(
              (msg) =>
                `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
            )
            .join("\n")
        : "";

    // Create a conversation-aware prompt
    const conversationPrompt =
      conversationHistory.length > 0
        ? `Previous conversation:
${conversationContext}

Current question: ${question}

Please answer the current question while considering the conversation history above.`
        : question;

    const result = await retrievalChain.invoke({
      input: conversationPrompt,
    });

    return result.answer;
  } catch (error) {
    console.error("Error getting answer:", error);
    return "Sorry, I encountered an error while processing your question. Please try again.";
  }
};
