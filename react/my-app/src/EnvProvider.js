import React, { createContext, useState, useEffect, useContext } from 'react';

// コンテキストの作成
const EnvContext = createContext(null);

// カスタムフックの作成
const useEnvConfig = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/config.json')
      .then(response => response.json())
      .then(data => {
        setConfig(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, []);

  return { config, loading, error };
};

// プロバイダーコンポーネント
export const EnvProvider = ({ children }) => {
  const { config, loading, error } = useEnvConfig();

  if (loading) return <div>Loading environment configuration...</div>;
  if (error) return <div>Error loading environment configuration: {error.message}</div>;

  return (
    <EnvContext.Provider value={config}>
      {children}
    </EnvContext.Provider>
  );
};

// 環境変数を使用するためのカスタムフック
export const useEnv = () => {
  const context = useContext(EnvContext);
  if (context === undefined) {
    throw new Error('useEnv must be used within an EnvProvider');
  }
  return context;
};

export default EnvProvider;