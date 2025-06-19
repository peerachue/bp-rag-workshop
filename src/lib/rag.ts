import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AzureChatOpenAI, AzureOpenAIEmbeddings } from "@langchain/openai";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

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

async function initializeRAG() {
	if (isInitialized) return;

	try {
		const docs = await loadDocumentsByCategory("./docs");

		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: 200,
			chunkOverlap: 20,
		});

		const chunks = await splitter.splitDocuments(docs);

		const embeddings = new AzureOpenAIEmbeddings({
			azureOpenAIApiEmbeddingsDeploymentName: "text-embedding-ada-002",
			azureOpenAIApiVersion: "2023-05-15",
			azureOpenAIApiKey: "bba1ed7f75084de59cb547e9d8876807",
			azureOpenAIBasePath:
				"https://chaiwat-n-ai-aiservices.cognitiveservices.azure.com/openai/deployments",
		});

		vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

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
			k: 6, // Try increasing this
		});

		retrievalChain = await createRetrievalChain({
			retriever,
			combineDocsChain,
		});

		isInitialized = true;
	} catch (error) {
		console.error("Failed to initialize RAG:", error);
		throw error;
	}
}

export const getAnswer = async (
	question: string,
	conversationHistory: Array<{ role: string; content: string }> = []
) => {
	if (!isInitialized) {
		await initializeRAG();
	}

	if (!retrievalChain) {
		throw new Error("RAG system not properly initialized");
	}

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
