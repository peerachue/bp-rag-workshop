import "./index.css";
import Layout from "./components/ui/layout";
import { Chat } from "./components/chat";

export function App() {
	return (
		<div>
			<Layout>
				<Chat />
			</Layout>
		</div>
	);
}

export default App;
