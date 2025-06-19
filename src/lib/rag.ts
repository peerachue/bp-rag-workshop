import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AzureChatOpenAI, AzureOpenAIEmbeddings } from "@langchain/openai";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { VectorStore } from "@langchain/core/vectorstores";

// Global variables to store initialized components
let vectorStore: VectorStore | null = null;
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

// Add caching mechanism
const CACHE_DIR = "./.vector-cache";
const CACHE_METADATA_FILE = path.join(CACHE_DIR, "metadata.json");

async function ensureCacheDir() {
	try {
		await fs.access(CACHE_DIR);
	} catch {
		await fs.mkdir(CACHE_DIR, { recursive: true });
	}
}

async function getFileHash(filePath: string): Promise<string> {
	const stats = await fs.stat(filePath);
	return `${path.basename(filePath)}-${stats.size}-${stats.mtime.getTime()}`;
}

async function isCacheValid(): Promise<boolean> {
	try {
		const metadata = JSON.parse(await fs.readFile(CACHE_METADATA_FILE, "utf-8"));
		const allFiles = await getAllFiles("./docs");
		
		// Check if all files match the cached metadata
		for (const file of allFiles) {
			const currentHash = await getFileHash(file);
			if (metadata[file] !== currentHash) {
				return false;
			}
		}
		return true;
	} catch {
		return false;
	}
}

async function saveCacheMetadata(fileHashes: Record<string, string>) {
	await ensureCacheDir();
	await fs.writeFile(CACHE_METADATA_FILE, JSON.stringify(fileHashes, null, 2));
}

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

	// Process files in parallel with concurrency limit
	const concurrencyLimit = 3;
	const chunks = [];
	for (let i = 0; i < allFiles.length; i += concurrencyLimit) {
		chunks.push(allFiles.slice(i, i + concurrencyLimit));
	}

	for (const chunk of chunks) {
		const chunkPromises = chunk.map(async (file) => {
			let loader;

			if (file.endsWith(".txt")) {
				loader = new TextLoader(file);
			} else if (file.endsWith(".pdf")) {
				loader = new PDFLoader(file, {
					// Optimize PDF loading
					splitPages: false,
				});
			} else {
				return [];
			}

			const docs = await loader.load();

			// Add metadata to each document
			for (const doc of docs) {
				const relativePath = path.relative(basePath, file);
				const category = path.dirname(relativePath).split(path.sep).join("/");

				doc.metadata = {
					...doc.metadata,
					category,
					filename: path.basename(file),
				};
			}

			return docs;
		});

		const chunkResults = await Promise.all(chunkPromises);
		allDocs.push(...chunkResults.flat());
	}

	return allDocs;
}

async function initializeRAG() {
	if (isInitialized) return;

	try {
		console.log("🔄 Initializing RAG system...");
		
		// Check if cache is valid
		const cacheValid = await isCacheValid();
		
		if (cacheValid) {
			console.log("📦 Loading from cache...");
			const embeddings = new AzureOpenAIEmbeddings({
				azureOpenAIApiEmbeddingsDeploymentName: "text-embedding-ada-002",
				azureOpenAIApiVersion: "2023-05-15",
				azureOpenAIApiKey: "bba1ed7f75084de59cb547e9d8876807",
				azureOpenAIBasePath:
					"https://chaiwat-n-ai-aiservices.cognitiveservices.azure.com/openai/deployments",
			});

			try {
				vectorStore = await Chroma.fromExistingCollection(embeddings, {
					collectionName: "banpu-docs",
					url: "http://localhost:8000", // ChromaDB server
				});
			} catch (error) {
				console.log("⚠️ ChromaDB not available, falling back to memory store...");
				// Fallback to memory store if ChromaDB is not available
				await processDocumentsAndCreateVectorStore(embeddings);
			}
		} else {
			console.log("📚 Processing documents...");
			const embeddings = new AzureOpenAIEmbeddings({
				azureOpenAIApiEmbeddingsDeploymentName: "text-embedding-ada-002",
				azureOpenAIApiVersion: "2023-05-15",
				azureOpenAIApiKey: "bba1ed7f75084de59cb547e9d8876807",
				azureOpenAIBasePath:
					"https://chaiwat-n-ai-aiservices.cognitiveservices.azure.com/openai/deployments",
			});

			await processDocumentsAndCreateVectorStore(embeddings);
		}

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

		if (!vectorStore) {
			throw new Error("Vector store not initialized");
		}

		const retriever = vectorStore.asRetriever({
			k: 6, // Try increasing this
		});

		retrievalChain = await createRetrievalChain({
			retriever,
			combineDocsChain,
		});

		isInitialized = true;
		console.log("✅ RAG system initialized successfully");
	} catch (error) {
		console.error("Failed to initialize RAG:", error);
		throw error;
	}
}

async function processDocumentsAndCreateVectorStore(embeddings: AzureOpenAIEmbeddings) {
	const docs = await loadDocumentsByCategory("./docs");

	// Optimize chunking strategy
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: 1000, // Increased chunk size
		chunkOverlap: 200, // Increased overlap for better context
		separators: ["\n\n", "\n", ". ", "! ", "? ", " ", ""], // Better separators
	});

	console.log(`📄 Splitting ${docs.length} documents into chunks...`);
	const chunks = await splitter.splitDocuments(docs);
	console.log(`✅ Created ${chunks.length} chunks`);

	console.log("🔗 Creating vector embeddings...");
	
	try {
		// Try ChromaDB first
		vectorStore = await Chroma.fromDocuments(chunks, embeddings, {
			collectionName: "banpu-docs",
			url: "http://localhost:8000", // ChromaDB server
		});
		console.log("✅ Using ChromaDB for vector storage");
	} catch (error) {
		console.log("⚠️ ChromaDB not available, using memory store...");
		// Fallback to memory store
		vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);
		console.log("✅ Using MemoryVectorStore for vector storage");
	}

	// Save cache metadata
	const allFiles = await getAllFiles("./docs");
	const fileHashes: Record<string, string> = {};
	for (const file of allFiles) {
		fileHashes[file] = await getFileHash(file);
	}
	await saveCacheMetadata(fileHashes);
}

// Helper function to get all files (moved outside for reuse)
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
