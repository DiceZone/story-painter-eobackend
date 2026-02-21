import { useState, useEffect } from 'react';
import { LOG_RETENTION_DAYS } from '../../config/appConfig';

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
        alert('API链接已复制！');
      })
      .catch(err => {
        console.error('复制失败: ', err);
        const textArea = document.createElement('textarea');
        textArea.value = fullUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('API链接已复制！');
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
          background: #fafbfc;
          min-height: 100vh;
          color: #24292f;
          line-height: 1.6;
        }
      `}</style>
      <style jsx>{`
        .navbar {
          background: #fff;
          border-bottom: 1px solid #d0d7de;
          padding: 0 24px;
          height: 64px;
          display: flex;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        
        .navbar-brand {
          font-size: 16px;
          font-weight: 600;
          color: #24292f;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .navbar-logo {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        
        .navbar-logo img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        
        .navbar-version {
          margin-left: 12px;
          font-size: 12px;
          color: #57606a;
          padding: 2px 6px;
          background: #eaeef2;
          border-radius: 12px;
          display: inline-block;
        }
        
        .navbar-log-retention {
          position: fixed;
          bottom: 24px;
          right: 24px;
          font-size: 12px;
          color: #fff;
          padding: 8px 16px;
          background: #10b981;
          border-radius: 24px;
          display: flex;
          align-items: center;
          gap: 6px;
          z-index: 101;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
          opacity: 0.8;
        }
        
        .container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 40px 24px;
        }
        
        .section-title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #d0d7de;
          color: #24292f;
        }
        
        .description {
          font-size: 14px;
          color: #57606a;
          margin-bottom: 32px;
          line-height: 1.5;
        }
        
        .api-list {
          background: #fff;
          border: 1px solid #d0d7de;
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 32px;
        }
        
        .api-item {
          display: flex;
          align-items: flex-start;
          padding: 16px 24px;
          border-bottom: 1px solid #d0d7de;
          gap: 16px;
        }
        
        .api-item:last-child {
          border-bottom: none;
        }
        
        .api-item:hover {
          background: #f6f8fb;
        }
        
        .api-method {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 28px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #fff;
          flex-shrink: 0;
          margin-top: 2px;
        }
        
        .method-get {
          background: #0969da;
        }
        
        .method-put {
          background: #9e6a03;
        }
        
        .method-post {
          background: #238636;
        }
        
        .api-details {
          flex: 1;
          min-width: 0;
        }
        
        .api-path {
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
          font-size: 13px;
          font-weight: 600;
          color: #24292f;
          word-break: break-all;
          margin-bottom: 4px;
          letter-spacing: 0.2px;
        }
        
        .api-description {
          font-size: 13px;
          color: #57606a;
          margin-bottom: 8px;
        }
        
        .api-url {
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
          font-size: 12px;
          color: #57606a;
          background: #f6f8fb;
          padding: 4px 8px;
          border-radius: 3px;
          word-break: break-all;
          border: 1px solid #e1e6eb;
          padding: 6px 8px;
          display: inline-block;
          max-width: 100%;
        }
        
        .api-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
          margin-top: 2px;
        }
        
        .copy-btn {
          background: #f6f8fb;
          border: 1px solid #d0d7de;
          border-radius: 4px;
          color: #24292f;
          cursor: pointer;
          padding: 6px 12px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.2s;
          white-space: nowrap;
          font-weight: 500;
        }
        
        .copy-btn:hover {
          background: #eaeef2;
          border-color: #bec3cc;
        }
        
        .copy-btn:active {
          transform: scale(0.98);
        }
        
        .footer {
          text-align: center;
          margin-top: 48px;
          padding-top: 24px;
          border-top: 1px solid #d0d7de;
        }
        
        .github-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #24292f;
          color: white;
          text-decoration: none;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          transition: background 0.2s;
        }
        
        .github-btn:hover {
          background: #3d444d;
        }
        
        @media (max-width: 640px) {
          .navbar {
            padding: 0 16px;
          }
          
          .container {
            padding: 24px 16px;
          }
          
          .api-item {
            flex-direction: column;
            padding: 12px 16px;
          }
          
          .api-actions {
            width: 100%;
          }
          
          .copy-btn {
            flex: 1;
            justify-content: center;
          }
        }
      `}</style>
      <nav className="navbar">
        <a href="/" className="navbar-brand">
          <span className="navbar-logo">
            <img src="/icon.png" alt="SealDice Logo" />
          </span>
          SealDice Log Service
          <span className="navbar-version">v20260222-beta0340</span>
        </a>
      </nav>
      
      <div className="navbar-log-retention">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        日志留存 {LOG_RETENTION_DAYS} 天
      </div>
      
      <div className="container">
        <p className="description">
          用于对接海豹骰子（SealDice）的自维护日志存储后端服务。
        </p>
        
        <h2 className="section-title">API 端点</h2>
        
        <div className="api-list">
          <div className="api-item">
            <div className={`api-method method-put`}>PUT</div>
            <div className="api-details">
              <div className="api-path">/api/dice/log</div>
              <div className="api-description">上传日志文件</div>
              {baseUrl && (
                <div className="api-url">{baseUrl}/api/dice/log</div>
              )}
            </div>
            <div className="api-actions">
              <button 
                className="copy-btn" 
                onClick={() => copyToClipboard('/api/dice/log')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                复制
              </button>
            </div>
          </div>
          
          <div className="api-item">
            <div className={`api-method method-get`}>GET</div>
            <div className="api-details">
              <div className="api-path">/api/dice/load_data</div>
              <div className="api-description">根据 Key 和 Password 读取日志数据</div>
              {baseUrl && (
                <div className="api-url">{baseUrl}/api/dice/load_data</div>
              )}
            </div>
            <div className="api-actions">
              <button 
                className="copy-btn" 
                onClick={() => copyToClipboard('/api/dice/load_data')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                复制
              </button>
            </div>
          </div>
          
          <div className="api-item">
            <div className={`api-method method-put`}>PUT</div>
            <div className="api-details">
              <div className="api-path">/api/dice/backup-upload</div>
              <div className="api-description">备用上传接口，用于主存储失败时的级联转发</div>
              {baseUrl && (
                <div className="api-url">{baseUrl}/api/dice/backup-upload</div>
              )}
            </div>
            <div className="api-actions">
              <button 
                className="copy-btn" 
                onClick={() => copyToClipboard('/api/dice/backup-upload')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                复制
              </button>
            </div>
          </div>
        </div>
        
        <div className="footer">
          <a 
            href="https://github.com/DiceZone/story-painter-eobackend" 
            className="github-btn"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            源码
          </a>
        </div>
      </div>
    </>
  );
}
