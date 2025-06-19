import { Textarea } from "@/components/ui/textarea";
import { Button } from "./ui/button";
import { useState, useEffect } from "react";

interface Message {
	role: string;
	content: string;
	timestamp?: number;
}

export const Chat = () => {
	const [messages, setMessages] = useState<Message[]>([]);
	const [inputValue, setInputValue] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	// Load chat history from localStorage on component mount
	useEffect(() => {
		const savedMessages = localStorage.getItem("chatHistory");
		if (savedMessages) {
			try {
				const parsedMessages = JSON.parse(savedMessages);
				setMessages(parsedMessages);
			} catch (error) {
				console.error("Error loading chat history:", error);
			}
		}
	}, []);

	// Save messages to localStorage whenever messages change
	useEffect(() => {
		localStorage.setItem("chatHistory", JSON.stringify(messages));
	}, [messages]);

	const handleSend = async () => {
		if (!inputValue.trim() || isLoading) return;

		const userMessage: Message = { 
			role: "user", 
			content: inputValue,
			timestamp: Date.now()
		};
		setMessages((prev) => [...prev, userMessage]);
		setIsLoading(true);
		setInputValue("");

		try {
			// Send the current question along with conversation history
			const response = await fetch("/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ 
					question: inputValue,
					conversationHistory: messages.map(msg => ({
						role: msg.role,
						content: msg.content
					}))
				}),
			});

			if (!response.ok) {
				throw new Error("Failed to get response");
			}

			const data = await response.json();
			const assistantMessage: Message = { 
				role: "assistant", 
				content: data.answer,
				timestamp: Date.now()
			};

			setMessages((prev) => [...prev, assistantMessage]);
		} catch (error) {
			console.error("Error sending message:", error);
			const errorMessage: Message = {
				role: "assistant",
				content: "Sorry, I encountered an error. Please try again.",
				timestamp: Date.now()
			};
			setMessages((prev) => [...prev, errorMessage]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const clearChatHistory = () => {
		setMessages([]);
		localStorage.removeItem("chatHistory");
	};

	return (
		<div className="flex flex-col min-h-full p-4 gap-4">
			<div className="flex justify-between items-center">
				<h2 className="text-lg font-semibold">Chat</h2>
				{messages.length > 0 && (
					<Button 
						variant="outline" 
						size="sm" 
						onClick={clearChatHistory}
						className="text-xs"
					>
						Clear History
					</Button>
				)}
			</div>
			
			<div className="flex-1 rounded-xl p-4 overflow-y-auto min-h-0 ">
				<div className="flex flex-col gap-4">
					{messages.length === 0 && (
						<div className="text-center text-muted-foreground py-8">
							<p>Start a conversation by typing a message below.</p>
						</div>
					)}
					{messages.map((message, index) => (
						<div className=" rounded-xl p-4 bg-white" key={index}>
							<div className="space-y-4">
								<div className="flex gap-3">
									<div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
										{message.role === "user" ? "U" : "A"}
									</div>
									<div className="flex-1">
										<p className="text-sm whitespace-pre-wrap">
											{message.content}
										</p>
										{message.timestamp && (
											<p className="text-xs text-muted-foreground mt-2">
												{new Date(message.timestamp).toLocaleTimeString()}
											</p>
										)}
									</div>
								</div>
							</div>
						</div>
					))}
					{isLoading && (
						<div className="bg-muted/50 rounded-xl p-4 bg-white">
							<div className="flex gap-3">
								<div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
									A
								</div>
								<div className="flex-1">
									<p className="text-sm">Thinking...</p>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			<div className="h-20 w-full flex gap-2 items-center">
				<div className="flex h-full w-full rounded-xl bg-white">
					<Textarea
						placeholder="Type your message here."
						className="h-full resize-none"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyPress={handleKeyPress}
						disabled={isLoading}
					/>
				</div>
				<Button onClick={handleSend} disabled={!inputValue.trim() || isLoading}>
					{isLoading ? "Sending..." : "Send"}
				</Button>
			</div>
		</div>
	);
};
