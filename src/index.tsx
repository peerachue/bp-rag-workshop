import { serve } from "bun";
import index from "./index.html";

// Import the RAG functionality for server-side use
import { getAnswer } from "./lib/rag";

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

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
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

          const answer = await getAnswer(question, conversationHistory);
          
          return Response.json({
            answer,
            question
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
