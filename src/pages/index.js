import { useState, useEffect } from 'react';

export default function HomePage() {
  const [baseUrl, setBaseUrl] = useState('');
  
  useEffect(() => {
    // 在客户端获取当前域名
    setBaseUrl(`${window.location.protocol}//${window.location.host}`);
  }, []);

  const copyToClipboard = (path) => {
    const fullUrl = `${baseUrl}${path}`;
    navigator.clipboard.writeText(fullUrl)
      .then(() => {
        alert('API链接已复制到剪贴板！');
      })
      .catch(err => {
        console.error('复制失败: ', err);
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = fullUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('API链接已复制到剪贴板！');
      });
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
        
        .version-badge {
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
          position: relative;
          box-sizing: border-box;
          cursor: default;
          flex-wrap: nowrap;
          padding: 4px 10px;
          border-radius: 8px;
          color: #00c180;
          background-color: rgba(99, 226, 183, 0.15);
          transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          line-height: 1;
          height: 28px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        
        .version-badge:hover {
          background-color: rgba(99, 226, 183, 0.25);
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
          position: relative;
        }
        
        .api-path-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }
        
        .api-path {
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
          font-size: 1rem;
          font-weight: 600;
          color: #5a4b6c;
          word-break: break-all;
          margin-right: 1rem;
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
          white-space: nowrap;
        }
        
        .api-description {
          font-size: 0.9rem;
          color: #7a6b8d;
          margin-top: 0.5rem;
        }
        
        .copy-btn {
          background: #6fb3e0;
          border: none;
          border-radius: 4px;
          color: white;
          cursor: pointer;
          padding: 0.4rem 0.8rem;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          transition: background-color 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        
        .copy-btn:hover {
          background: #5a9fd0;
        }
        
        .copy-btn:active {
          transform: scale(0.98);
        }
        
        .api-full-url {
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
          font-size: 0.9rem;
          color: #7a6b8d;
          background: #f0f5ff;
          padding: 0.5rem 0.8rem;
          border-radius: 4px;
          margin-top: 0.8rem;
          word-break: break-all;
          border: 1px solid #e0f0ff;
          display: block;
        }
        
        .github-section {
          text-align: center;
          margin-top: 2rem;
        }
        
        .github-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: #333;
          color: white;
          text-decoration: none;
          padding: 0.3rem 0.7rem;
          border-radius: 6px;
          font-size: 0.9rem;
          transition: background-color 0.2s;
        }
        
        .github-btn:hover {
          background: #555;
        }
        
        .url-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 0.8rem;
        }
        
        .api-full-url {
          flex: 1;
          margin-top: 0;
          margin-right: 0.8rem;
        }
        
        @media (max-width: 600px) {
          .container {
              padding: 20px;
              margin: 1rem;
          }
          
          .title {
              font-size: 1.4rem;
          }
          
          .api-path-container {
              flex-direction: column;
              align-items: flex-start;
              gap: 0.5rem;
          }
          
          .url-container {
              flex-direction: column;
              align-items: flex-start;
              gap: 0.5rem;
          }
          
          .api-full-url {
              margin-right: 0;
              width: 100%;
          }
          
          .copy-btn {
              align-self: flex-end;
          }
          
          .api-full-url {
              font-size: 0.85rem;
              padding: 0.4rem 0.6rem;
          }
        }
      `}</style>
      <div className="container">
        <div className="header">
          <h1 className="title">SealDice Log Service</h1>
          <div style={{ textAlign: 'center' }}>
            <span className="version-badge">v20260222-beta0130</span>
          </div>
        </div>
        <p className="description">
          用于对接海豹骰子（SealDice）的自维护日志存储后端服务。
        </p>
        <div className="api-grid">
          <div className="api-card">
            <div className="api-path-container">
              <div>
                <span className="api-path">/api/dice/log</span>
                <span className="api-method">PUT</span>
              </div>
            </div>
            <p className="api-description">上传日志文件。</p>
            {baseUrl && (
              <div className="url-container">
                <div className="api-full-url">
                  {baseUrl}/api/dice/log
                </div>
                <button 
                  className="copy-btn" 
                  onClick={() => copyToClipboard('/api/dice/log')}
                  title="复制完整API链接"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  复制
                </button>
              </div>
            )}
          </div>
          <div className="api-card">
            <div className="api-path-container">
              <div>
                <span className="api-path">/api/dice/load_data</span>
                <span className="api-method">GET</span>
              </div>
            </div>
            <p className="api-description">根据 Key 和 Password 读取日志数据。</p>
            {baseUrl && (
              <div className="url-container">
                <div className="api-full-url">
                  {baseUrl}/api/dice/load_data
                </div>
                <button 
                  className="copy-btn" 
                  onClick={() => copyToClipboard('/api/dice/load_data')}
                  title="复制完整API链接"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  复制
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="github-section">
          <a 
            href="https://github.com/ShiaBox/story-painter-backend" 
            className="github-btn"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            源码
          </a>
        </div>
      </div>
    </>
  );
}
