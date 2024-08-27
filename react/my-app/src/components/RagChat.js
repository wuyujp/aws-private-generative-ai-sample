import { useState, useEffect } from "react";
import './Chat.css';
import { v4 as uuidv4 } from 'uuid';
import { useEnv } from '../EnvProvider';

const invokeBedrockKB = async (apiUrl, token, aIModel, prompt) => {

    console.log("prompt:", JSON.stringify({ prompt }));

    const payload = {
        prompt: prompt,
        aiModel: aIModel,
    };

    const response = await fetch(`${apiUrl}rag`, {
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
    const [chatId, setChatId] = useState(null);
    const [textModelID, setTextModelID] = useState(null);
    const [userID, setUserID] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [apiURL, setAPIURL] = useState(null);
    const [jwtToken, setJwtToken] = useState(null);
    const env = useEnv();

    useEffect(() => {
        // コンポーネントマウント時に新しいチャットセッションを開始
        startNewChat();
    }, []);
    const startNewChat = () => {
        const newChatId = uuidv4();
        setChatId(newChatId);
        setUserID(localStorage.getItem('user'));
        setTextModelID(env.TEXT_MODEL_ID);
        setAPIURL(env.API_URL);
        setJwtToken(localStorage.getItem('jwt'));
        setMessages([]);
        // ここでバックエンドに新しいチャットセッションの開始を通知することもできます
    };

    const addMessage = async (text, sender) => {
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
                const apiResponse = await invokeBedrockKB(apiURL, jwtToken, textModelID, fullConversation);

                const botMessage = {
                    text: apiResponse.text,
                    urls: apiResponse.response_s3_presigned_url_list,
                    sender: 'bot',
                    id: Date.now()
                };
                await setMessages(prevMessages => [...prevMessages, botMessage]);
                await addChatHistory(apiURL, jwtToken, userID, chatId, textModelID, `${fullConversation}\nAssistant: ${apiResponse.text}`, 'ragchat');

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
      <InputArea onSendMessage={(text) => addMessage(text, 'user')} isLoading={isLoading} />
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
    <p>{message.text}</p>
    {message.urls && message.urls.length > 0 && (
      <div className="message-links">
        <p>関連ドキュメント:</p>
        <ul>
          {message.urls.map((urlItem, index) => (
            <li key={index}>
              <a 
                href={urlItem.presigned_url} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                {urlItem.object_key}
              </a>
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

const InputArea = ({ onSendMessage, isLoading }) => {
    const [input, setInput] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSendMessage(input);
            setInput('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="input-area">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="メッセージを入力..."
        disabled={isLoading}
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? '送信中...' : '送信'}
      </button>
    </form>
    );
};

export default ChatContainer;
