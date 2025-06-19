import { serve } from "bun";
import index from "./index.html";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "langchain/document";
// Import the RAG functionality for server-side use
import { getAnswer } from "./lib/rag";

import { AzureOpenAIEmbeddings } from "@langchain/openai";

import {
  PGVectorStore,
  type DistanceStrategy,
} from "@langchain/community/vectorstores/pgvector";
import type { PoolConfig } from "pg";



import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AzureChatOpenAI } from "@langchain/openai";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";


const endpoint = process.env["AZURE_OPENAI_ENDPOINT"] || "";
const apiKey = process.env["AZURE_OPENAI_API_KEY"] || "";
const apiVersion = process.env["AZURE_OPENAI_API_VERSION"] || "";
const deployment = process.env["AZURE_OPENAI_API_DEPLOYMENT_NAME"] || "";


const embeddings = new AzureOpenAIEmbeddings({
  azureOpenAIApiEmbeddingsDeploymentName: "text-embedding-ada-002",
  azureOpenAIApiVersion: "2023-05-15",
  azureOpenAIApiKey: "bba1ed7f75084de59cb547e9d8876807",
  azureOpenAIBasePath:
    "https://chaiwat-n-ai-aiservices.cognitiveservices.azure.com/openai/deployments",
});

const config = {
  postgresConnectionOptions: {
    type: "postgres",
    host: "127.0.0.1",
    port: 5432,
    user: "myuser",
    password: "ChangeMe",
    database: "api",
  } as PoolConfig,
  tableName: "testlangchainjs",
  columns: {
    idColumnName: "id",
    vectorColumnName: "vector",
    contentColumnName: "content",
    metadataColumnName: "metadata",
  },
  // supported distance strategies: cosine (default), innerProduct, or euclidean
  distanceStrategy: "cosine" as DistanceStrategy,
};

const vectorStore = await PGVectorStore.initialize(embeddings, config);

 const llm = new AzureChatOpenAI({
      model: "gpt-4o",
      temperature: 1,
      maxTokens: undefined,
      maxRetries: 2,
      azureOpenAIApiKey: apiKey,
      azureOpenAIApiInstanceName: endpoint,
      azureOpenAIApiDeploymentName: deployment,
      azureOpenAIApiVersion: apiVersion,
    });

    const prompt = ChatPromptTemplate.fromTemplate(
      `You are a helpful assistant with access to conversation history and relevant context. Use the context below to answer the user's question, and consider the conversation history to provide more relevant and contextual responses.

      <context>
      {context}
      </context>
      
      Question: {input}
      
      Instructions:
      - If the context is unrelated to the question, say "I don't have information about that in my knowledge base."
      - If the question refers to previous parts of the conversation, use that context to provide a more relevant answer.
      - Be conversational and maintain context from the ongoing conversation.
      - Each context may contain a 'Category' and 'Filename' to help you understand the source.`
    );

    const combineDocsChain = await createStuffDocumentsChain({ llm, prompt });

    const retriever = vectorStore.asRetriever({
      k: 6,
    });

    const retrievalChain = await createRetrievalChain({
      retriever,
      combineDocsChain,
    });

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async (req) => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },

    "/api/upload": {
      async POST(req) {
        try {
          const formData = await req.formData();
          const file = formData.get("file") as File;
          const category = formData.get("category") as string;

          if (!file) {
            return Response.json(
              { error: "No file provided" },
              { status: 400 }
            );
          }

          // Check file extension
          const fileName = file.name.toLowerCase();
          const isValidExtension =
            fileName.endsWith(".txt") || fileName.endsWith(".pdf");

          if (!isValidExtension) {
            return Response.json(
              {
                error: "Unsupported file type. Only .txt and .pdf are allowed.",
              },
              { status: 400 }
            );
          }

          // Check MIME type (more flexible validation)
          const allowedTypes = [
            "text/plain",
            "application/pdf",
            "text/txt",
            "",
          ];
          const isValidMimeType =
            allowedTypes.includes(file.type) ||
            (fileName.endsWith(".txt") &&
              (file.type === "" || file.type.startsWith("text/"))) ||
            (fileName.endsWith(".pdf") && file.type === "application/pdf");

          if (!isValidMimeType) {
            console.log(
              "File type received:",
              file.type,
              "for file:",
              file.name
            );
            return Response.json(
              {
                error: `Unsupported file type. File type detected: ${file.type}. Only .txt and .pdf are allowed.`,
              },
              { status: 400 }
            );
          }

          // Check file size (optional - 10MB limit)
          const maxSize = 10 * 1024 * 1024; // 10MB
          if (file.size > maxSize) {
            return Response.json(
              { error: "File too large. Maximum size is 10MB." },
              { status: 400 }
            );
          }

          // Create uploads directory if it doesn't exist
          const uploadsDir = join(process.cwd(), "uploads");
          await mkdir(uploadsDir, { recursive: true });

          // Generate unique filename
          const timestamp = Date.now();
          const fileExtension = file.name.split(".").pop();
          const filename = `${timestamp}_${file.name}`;
          const filepath = join(uploadsDir, filename);

          // Read file content
          const fileContent = await file.text();
          console.log("Uploaded file content:", fileContent);

          // Create a Document from the uploaded file content
          const doc = new Document({
            pageContent: fileContent,
            metadata: {
              source: file.name,
              category: category || "uncategorized",
              uploadedAt: new Date().toISOString(),
              fileSize: file.size,
              fileType: file.type,
              
            },
          });

          const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 200,
            chunkOverlap: 20,
          });

          // Split the document created from uploaded file content
          const chunks = await splitter.splitDocuments([doc]);

          await vectorStore.addDocuments(chunks);

          // Save file
          const buffer = await file.arrayBuffer();
          await writeFile(filepath, new Uint8Array(buffer));

          return Response.json({
            message: "File uploaded successfully",
            filename,
            originalName: file.name,
            size: file.size,
            type: file.type,
            detectedExtension: fileExtension,
          });
        } catch (error) {
          console.error("Error in upload API:", error);
          return Response.json(
            { error: "Failed to upload file" },
            { status: 500 }
          );
        }
      },
    },

    "/api/chat": {
      async POST(req) {
        try {
          const { question, conversationHistory = [] } = await req.json();

          if (!question) {
            return Response.json(
              { error: "Question is required" },
              { status: 400 }
            );
          }

          const answer = await getAnswer(retrievalChain, question, conversationHistory);

          return Response.json({
            answer,
            question,
          });
        } catch (error) {
          console.error("Error in chat API:", error);
          return Response.json(
            { error: "Failed to process question" },
            { status: 500 }
          );
        }
      },
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
function uuidv4(): string[] | undefined {
  throw new Error("Function not implemented.");
}
