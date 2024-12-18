import { useState } from "react";
import './Chat.css';
import { v4 as uuidv4 } from 'uuid';
import { useEnv } from '../EnvProvider';
import MarkdownRenderer from './MarkdownRenderer';

const invokeBedrock = async (apiUrl, token, aIModel, prompt, systemPrompt) => {

    console.log("prompt:", JSON.stringify({ prompt }));

    const payload = {
        prompt: prompt,
        systemPrompt: systemPrompt,
        aiModel: aIModel,
    };

    const response = await fetch(`${apiUrl}chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` // JWT トークンをセット
        },
        body: JSON.stringify(payload),
        //mode: 'no-cors'
    });
    const data = await response.json();
    console.log("response:", data);
    return data;
};

const addChatHistory = async (apiUrl, token, userID, chatID, aIModel, message, messageType) => {

    const payload = {
        userID: userID,
        chatID: chatID,
        aiModel: aIModel,
        message: message,
        messageType: messageType,
    };

    const response = await fetch(`${apiUrl}addChatHistory`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` // JWT トークンをセット

        },
        body: JSON.stringify(payload),
        //mode: 'no-cors'
    });
    const data = await response.json();
    console.log("response:", data);
    return data;
};

const ChatContainer = () => {
    // 状態の初期化
    const env = useEnv();
    const [chatId, setChatId] = useState(uuidv4());
    const [textModelID] = useState(env.TEXT_MODEL_ID);
    const [userID] = useState(localStorage.getItem('user'));
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [apiURL] = useState(env.API_URL);
    const [jwtToken] = useState(localStorage.getItem('jwt'));

    // //ローカルテスト用

    // const [chatId, setChatId] = useState(uuidv4());
    // const [textModelID] = useState('dummy');
    // const [userID] = useState('dummy');
    // const [messages, setMessages] = useState([]);
    // const [isLoading, setIsLoading] = useState(false);
    // const [apiURL] = useState('dummy');
    // const [jwtToken] = useState(localStorage.getItem('jwt'));


    const resetChat = () => {
        setChatId(uuidv4()); // 新しいチャットIDを生成
        setMessages([]); // メッセージをクリア
    };


    const addMessage = async (text, systemPrompt, sender) => {
        const newMessage = { text, sender, id: Date.now() };
        setMessages(prevMessages => [...prevMessages, newMessage]);
        if (sender === 'user') {
            setIsLoading(true);
            try {
                // 過去のメッセージを含む会話履歴を作成
                const conversationHistory = messages.map(msg =>
                    `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`
                ).join('\n');
                // 新しいユーザーメッセージを追加
                const fullConversation = `${conversationHistory}\nUser: ${text}`;
                console.log('messagesHistory', fullConversation);
                const apiResponse = await invokeBedrock(apiURL, jwtToken, textModelID, fullConversation, systemPrompt);

                const botMessage = { text: apiResponse, sender: 'bot', id: Date.now() };
                await setMessages(prevMessages => [...prevMessages, botMessage]);

                await addChatHistory(apiURL, jwtToken, userID, chatId, textModelID, `${fullConversation}\nAssistant: ${apiResponse}`, 'chat');
            }
            catch (error) {
                console.error('API呼び出しエラー:', error);
                const errorMessage = { text: 'エラーが発生しました。', sender: 'bot', id: Date.now() };
                setMessages(prevMessages => [...prevMessages, errorMessage]);
            }
            finally {
                setIsLoading(false);
            }
        }
    };

    return (
        <div className="chat-container">
            <MessageList messages={messages} />
            <InputArea onSendMessage={(text, systemPrompt) => addMessage(text, systemPrompt, 'user')} isLoading={isLoading} />
            <button onClick={resetChat} className="reset-button">リセット</button>
        </div>
    );
};

const MessageList = ({ messages }) => (
    <div className="message-list">
        {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
        ))}
    </div>
);

const MessageItem = ({ message }) => (
    <div className={`message-item ${message.sender}`}>
        <MarkdownRenderer content={message.text} />
    </div>
);

const InputArea = ({ onSendMessage, isLoading }) => {
    const [input, setInput] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('あなたは優秀なAIアシスタントです。');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSendMessage(input, systemPrompt);
            setInput('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="input-area">
            <div className="input-group">
                <span className="input-label">システム　</span>
                <input
                    type="text"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="あなたは優秀なAIアシスタントです。"
                />
            </div>
            <div className="input-group">
                <label htmlFor="input1">ユーザー　</label>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="メッセージを入力..."
                    disabled={isLoading}
                />
            </div>
            <button type="submit" disabled={isLoading}>
                {isLoading ? '送信中...' : '送信'}
            </button>
        </form>
    );
};

export default ChatContainer;
