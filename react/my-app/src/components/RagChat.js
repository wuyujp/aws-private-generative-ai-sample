import { useState } from "react";
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
        // 状態の初期化
    const env = useEnv();
    const [chatId, setChatId] = useState(uuidv4());
    const [textModelID] = useState(env.TEXT_MODEL_ID);
    const [userID] = useState(localStorage.getItem('user'));
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [apiURL] = useState(env.API_URL);
    const [jwtToken] = useState(localStorage.getItem('jwt'));
    
    const resetChat = () => {
        setChatId(uuidv4()); // 新しいチャットIDを生成
        setMessages([]); // メッセージをクリア
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
