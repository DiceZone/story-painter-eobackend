import { useState } from 'react';

export default function HomePage() {
  // 获取当前域名
  const currentDomain = typeof window !== 'undefined' ? window.location.origin : '';
  
  // 复制功能
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    }
  };

  return (
    <>
      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
        }
        
        body {
          background: #f8f9ff;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #5a4b6c;
          line-height: 1.6;
          padding: 20px;
        }
      `}</style>
      <style jsx>{`
        .container {
          max-width: 740px;
          background: #ffffff;
          border-radius: 12px;
          padding: 32px;
          box-shadow: 0 4px 15px rgba(137, 207, 240, 0.2);
          margin-bottom: 20px;
          border: 1px solid #e0f0ff;
        }
        
        .header {
          border-bottom: 1px solid #e0f0ff;
          padding-bottom: 1rem;
          margin-bottom: 2rem;
        }
        
        .title {
          font-size: 1.7rem;
          margin-bottom: 16px;
          color: #5a8de0;
          text-align: center;
          font-weight: 600;
        }
        
        .description {
          font-size: 0.95rem;
          margin-bottom: 24px;
          color: #7a6b8d;
          text-align: center;
          line-height: 1.7;
        }
        
        .api-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        
        .api-card {
          background-color: #f5f9ff;
          border-radius: 8px;
          padding: 1.5rem;
          text-align: left;
          border-left: 4px solid #8bc2f0;
          box-shadow: 0 2px 4px rgba(137, 207, 240, 0.2);
        }
        
        .api-path {
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
          font-size: 1rem;
          font-weight: 600;
          color: #5a4b6c;
        }
        
        .api-method {
          display: inline-block;
          background-color: #6fb3e0;
          color: #fff;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: bold;
          margin-left: 0.5rem;
        }
        
        .api-description {
          font-size: 0.9rem;
          color: #7a6b8d;
          margin-top: 0.5rem;
        }
        
        .domain-hint {
          font-size: 0.85rem;
          color: #7a6b8d;
          margin-top: 0.3rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .copy-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.2rem;
          border-radius: 3px;
          color: #8bc2f0;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        
        .copy-btn:hover {
          background-color: #e8f4ff;
          color: #5a8de0;
        }
        
        .copy-btn:active {
          transform: scale(0.95);
        }
        
        .copy-icon {
          width: 14px;
          height: 14px;
        }
        
        .copy-success {
          color: #4caf50;
          font-size: 0.8rem;
          margin-left: 0.5rem;
          animation: fadeOut 2s ease-in-out forwards;
        }
        
        @keyframes fadeOut {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        
        @media (max-width: 600px) {
          .container {
            padding: 20px;
            margin: 1rem;
          }
          
          .title {
            font-size: 1.4rem;
          }
        }
      `}</style>
      <div className="container">
        <div className="header">
          <h1 className="title">SealDice Log Service</h1>
        </div>
        <p className="description">
          用于对接海豹骰子（SealDice）的自维护日志存储后端服务。
        </p>
        <div className="api-grid">
          <APICard 
            domain={currentDomain} 
            path="/api/dice/log" 
            method="PUT" 
            description="上传日志文件。" 
            onCopy={copyToClipboard}
          />
          <APICard 
            domain={currentDomain} 
            path="/api/dice/load_data" 
            method="GET" 
            description="根据 Key 和 Password 读取日志数据。" 
            onCopy={copyToClipboard}
          />
        </div>
      </div>
    </>
  );
}

// API卡片组件
function APICard({ domain, path, method, description, onCopy }) {
  const [copied, setCopied] = useState(false);
  
  const fullPath = domain + path;
  
  const handleCopy = async () => {
    const success = await onCopy(fullPath);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  return (
    <div className="api-card">
      <div>
        <span className="api-path">{path}</span>
        <span className="api-method">{method}</span>
      </div>
      <p className="api-description">{description}</p>
      {domain && (
        <div className="domain-hint">
          <span>完整路径: {fullPath}</span>
          <button className="copy-btn" onClick={handleCopy} title="复制完整路径">
            <svg className="copy-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
          </button>
          {copied && <span className="copy-success">已复制!</span>}
        </div>
      )}
    </div>
  );
}
