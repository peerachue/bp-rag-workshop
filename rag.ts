import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
	AzureChatOpenAI,
	AzureOpenAI,
	AzureOpenAIEmbeddings,
	OpenAIEmbeddings,
} from "@langchain/openai";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

const instanceName = process.env["AZURE_OPENAI_API_INSTANCE_NAME"] || "";
const endpoint = process.env["AZURE_OPENAI_ENDPOINT"] || "";
const apiKey = process.env["AZURE_OPENAI_API_KEY"] || "";
const apiVersion = process.env["AZURE_OPENAI_API_VERSION"] || "";
const deployment = process.env["AZURE_OPENAI_API_DEPLOYMENT_NAME"] || "";

const loader = new TextLoader("data.txt");
const docs = await loader.load();

const splitter = new RecursiveCharacterTextSplitter({
	chunkSize: 200,
	chunkOverlap: 20,
});
const chunks = await splitter.splitDocuments(docs);

// const embeddings = new AzureOpenAIEmbeddings({
// 	azureOpenAIApiEmbeddingsDeploymentName: "text-embedding-ada-002",
// 	azureOpenAIApiInstanceName: instanceName,
// 	azureOpenAIApiVersion: apiVersion,
// 	azureOpenAIApiKey: apiKey,
// });
const embeddings = new AzureOpenAIEmbeddings();

const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

await embeddings.embedQuery("Hello, world!");

// const llm = new AzureOpenAI({
// 	model: "gpt-4o",
// 	temperature: 1,
// 	maxTokens: undefined,
// 	maxRetries: 2,
// 	timeout: undefined,
// 	azureOpenAIApiKey: apiKey,
// 	azureOpenAIApiInstanceName: endpoint,
// 	azureOpenAIApiDeploymentName: deployment,
// 	azureOpenAIApiVersion: apiVersion,
// });

// using AzureChatOpenAI

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

// const result = await llm.invoke([
// 	[
// 		"system",
// 		"You are a helpful assistant that translates English to French. Translate the user sentence.",
// 	],
// 	["human", "I love programming."],
// ]);
// console.log(result.content);

const prompt = ChatPromptTemplate.fromTemplate(
	`Answer the user's question based ONLY on the following context:
	
	<context>
	{context}
	</context>
	
	Question: {input}`
);

const combineDocsChain = await createStuffDocumentsChain({ llm, prompt });

const retriever = vectorStore.asRetriever({ k: 4 }); // Get top 4 results

const retrievalChain = await createRetrievalChain({
	retriever,
	combineDocsChain,
});

const question = "What is the main topic of the document?";

const result = await retrievalChain.invoke({
	input: question,
});

console.log("Answer:", result.answer);
