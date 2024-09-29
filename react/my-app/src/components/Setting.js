import { useEnv } from '../EnvProvider';
import { useState } from "react";
import { useNavigate } from 'react-router-dom';
import './Setting.css';


const Setting = ({ setIsAuthenticated }) => {

    const navigate = useNavigate();

    const logout = () => {
        localStorage.removeItem('jwt');
        localStorage.removeItem('user');
        setIsAuthenticated(false);
        navigate('/login'); // ログアウト後にログインページにリダイレクト
    };

    const env = useEnv();
    const [textModelID] = useState(env.TEXT_MODEL_ID);
    const [apiURL] = useState(env.API_URL);
    const region = apiURL.split('.')[2];
    const [userID] = useState(localStorage.getItem('user'));

    return (
        <div className="setting-container">
            <h2 className="setting-title">設定情報</h2>
            <dl className="setting-list">
                <div className="setting-item">
                    <dt>ユーザーID</dt>
                    <dd>{userID}</dd>
                </div>
                <div className="setting-item">
                    <dt>Bedrock基盤モデルID</dt>
                    <dd>{textModelID}</dd>
                </div>
                <div className="setting-item">
                    <dt>リージョン</dt>
                    <dd>{region}</dd>
                </div>
            </dl>
            <button onClick={logout} className="logout-button">ログアウト</button>
        </div>
    );
}

export default Setting;