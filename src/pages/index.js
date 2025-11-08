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
          position: relative;
        }
        
        .github-btn {
          position: absolute;
          top: 20px;
          right: 20px;
          background: #333;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        
        .github-btn:hover {
          background: #555;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .github-btn:active {
          transform: translateY(0);
        }
        
        .github-icon {
          width: 18px;
          height: 18px;
          fill: currentColor;
        }
        
        .header {
          border-bottom: 1px solid #e0f0ff;
          padding-bottom: 1rem;
          margin-bottom: 2rem;
          padding-right: 120px; /* 为GitHub按钮留出空间 */
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
        
        .api-url-container {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          margin-top: 0.8rem;
        }
        
        .api-full-url {
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
          font-size: 0.9rem;
          color: #7a6b8d;
          background: #f0f5ff;
          padding: 0.5rem 0.8rem;
          border-radius: 4px;
          word-break: break-all;
          border: 1px solid #e0f0ff;
          flex: 1;
        }
        
        .copy-btn {
          background: #6fb3e0;
          border: none;
          border-radius: 4px;
          color: white;
          cursor: pointer;
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          transition: background-color 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
          height: fit-content;
        }
        
        .copy-btn:hover {
          background: #5a9fd0;
        }
        
        .copy-btn:active {
          transform: scale(0.98);
        }
        
        .copy-icon {
          width: 14px;
          height: 14px;
        }
        
        @media (max-width: 600px) {
          .container {
              padding: 20px;
              margin: 1rem;
          }
          
          .title {
              font-size: 1.4rem;
          }
          
          .github-btn {
            position: relative;
            top: auto;
            right: auto;
            margin: 0 auto 20px auto;
            align-self: center;
          }
          
          .header {
            padding-right: 0;
          }
          
          .api-path-container {
              flex-direction: column;
              align-items: flex-start;
              gap: 0.5rem;
          }
          
          .api-url-container {
            flex-direction: column;
            align-items: stretch;
            gap: 0.5rem;
          }
          
          .copy-btn {
            align-self: flex-end;
            width: fit-content;
          }
          
          .api-full-url {
              font-size: 0.85rem;
              padding: 0.4rem 0.6rem;
          }
        }
      `}</style>
      
      <div className="container">
        {/* GitHub按钮 */}
        <a 
          href="https://github.com/ShiaBox/story-painter-backend" 
          target="_blank" 
          rel="noopener noreferrer"
          className="github-btn"
        >
          <svg className="github-icon" viewBox="0 0 16 16" width="16" height="16">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          源码
        </a>
        
        <div className="header">
          <h1 className="title">SealDice Log Backend</h1>
          <p className="description">
            用于接收并存储海豹核心的跑团日志，接口返回查看链接。
          </p>
        </div>
        
        <div className="api-grid">
          <div className="api-card">
            <div className="api-path-container">
              <span className="api-path">/api/dice/log</span>
              <span className="api-method">PUT</span>
            </div>
            <p className="api-description">
              multipart/form-data：name，uniform_id=xxx:数字，file&lt;2MB
            </p>
            <div className="api-url-container">
              <span className="api-full-url">{baseUrl}/api/dice/log</span>
              <button 
                className="copy-btn"
                onClick={() => copyToClipboard('/api/dice/log')}
              >
                <svg className="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeWidth="2"/>
                </svg>
                复制
              </button>
            </div>
          </div>
          
          <div className="api-card">
            <div className="api-path-container">
              <span className="api-path">/api/dice/load_data</span>
              <span className="api-method">GET</span>
            </div>
            <p className="api-description">
              参数：key=AbCd&amp;password=123456<br/>
              成功返回示例：{"{"}"url":"https://your-frontend.example.com/?key=AbCd#123456"{"}"}
            </p>
            <div className="api-url-container">
              <span className="api-full-url">{baseUrl}/api/dice/load_data?key=AbCd&amp;password=123456</span>
              <button 
                className="copy-btn"
                onClick={() => copyToClipboard('/api/dice/load_data?key=AbCd&password=123456')}
              >
                <svg className="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeWidth="2"/>
                </svg>
                复制
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
