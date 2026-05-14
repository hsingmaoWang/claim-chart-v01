import { useState, useEffect } from 'react'
import './App.css'
import UploadZone from './components/UploadZone'
import UrlInput from './components/UrlInput'
import Loader from './components/Loader'
import ResultCard from './components/ResultCard'
import MindMapTab from './components/MindMapTab'

function App() {
  const [appState, setAppState] = useState('idle'); // idle, processing, complete, error
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('claimChart');

  useEffect(() => {
    const handleImport = () => {
      const dataStr = localStorage.getItem('antigravity_imported_patent');
      if (dataStr) {
        try {
          const data = JSON.parse(dataStr);
          localStorage.removeItem('antigravity_imported_patent');
          handleProcessStart('extension', data);
        } catch (e) {
          console.error("Error parsing imported data", e);
        }
      }
    };

    // Check on mount in case it was loaded before React initialized
    handleImport();

    // Listen for custom event dispatched by extension's injected script
    window.addEventListener('antigravity_patent_imported', handleImport);
    return () => window.removeEventListener('antigravity_patent_imported', handleImport);
  }, []);

  const handleProcessStart = async (sourceType, data) => {
    setAppState('processing');
    console.log(`Processing ${sourceType}:`, data);
    setErrorMessage('');
    
    try {
      let response;
      if (sourceType === 'file') {
        const formData = new FormData();
        formData.append('file', data);
        response = await fetch('/api/process/pdf', {
          method: 'POST',
          body: formData,
        });
      } else if (sourceType === 'url') {
        response = await fetch('/api/process/url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: data }),
        });
      } else if (sourceType === 'extension') {
        response = await fetch('/api/process/extension', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      }

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      // Backend returns the PPTX file as a blob
      const blob = await response.blob();
      
      // Extract filename from Content-Disposition if possible, else default
      let filename = 'claim_chart.pptx';
      const disposition = response.headers.get('Content-Disposition');
      if (disposition && disposition.indexOf('filename=') !== -1) {
          const matches = disposition.match(/filename="?([^"]+)"?/);
          if (matches != null && matches[1]) filename = matches[1];
      }
      
      // Store blob URL for ResultCard to use
      window.downloadUrl = window.URL.createObjectURL(blob);
      window.downloadFilename = filename;
      
      setAppState('complete');
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'An error occurred during processing.');
      setAppState('error');
    }
  };

  const handleReset = () => {
    setAppState('idle');
    setErrorMessage('');
    if (window.downloadUrl) {
       window.URL.revokeObjectURL(window.downloadUrl);
       window.downloadUrl = null;
    }
  };

  return (
    <div className="app-container">
      <header className="hero">
        <div className="hero-content animate-fade-in">
          <div className="badge">AI Powered</div>
          <h1>Patent Claim Chart Generator</h1>
          <p>Instantly transform patent documents into presentation-ready claim charts. Upload a PDF or paste a Google Patents URL to begin.</p>
        </div>
      </header>

      <main className="main-content">
        <div className="tab-navigation glass-panel" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '2rem', padding: '1rem', borderBottom: '1px solid var(--color-border)', background: 'transparent' }}>
           <button 
             className={activeTab === 'claimChart' ? 'btn-primary' : 'btn-secondary'} 
             onClick={() => setActiveTab('claimChart')}
             style={{ padding: '0.5rem 2rem', borderRadius: '0.5rem', fontWeight: 'bold' }}
           >
             Claim Chart
           </button>
           <button 
             className={activeTab === 'mindMap' ? 'btn-primary' : 'btn-secondary'} 
             onClick={() => setActiveTab('mindMap')}
             style={{ padding: '0.5rem 2rem', borderRadius: '0.5rem', fontWeight: 'bold' }}
           >
             專利類別心智圖
           </button>
        </div>

        {activeTab === 'claimChart' ? (
          <>
            {appState === 'idle' && (
              <div className="input-section animate-fade-in" style={{ animationDelay: '0.1s' }}>
                <UploadZone onUpload={(file) => handleProcessStart('file', file)} />
                
                <div className="divider">
                  <span>OR</span>
                </div>
                
                <UrlInput onSubmit={(url) => handleProcessStart('url', url)} />
              </div>
            )}

            {appState === 'processing' && (
              <div className="processing-section animate-fade-in">
                 <Loader statusMessage="Extracting claims and figures..." />
              </div>
            )}

            {appState === 'complete' && (
              <div className="result-section animate-fade-in">
                <ResultCard onReset={handleReset} onDownload={() => {
                    if (window.downloadUrl) {
                        const a = document.createElement('a');
                        a.href = window.downloadUrl;
                        a.download = window.downloadFilename || 'claim_chart.pptx';
                        a.click();
                    }
                }} />
              </div>
            )}
            
            {appState === 'error' && (
               <div className="error-section animate-fade-in">
                  <div className="error-card">
                      <h3>Processing Failed</h3>
                      <p>{errorMessage}</p>
                      <button className="btn-secondary" onClick={handleReset}>Try Again</button>
                  </div>
               </div>
            )}
          </>
        ) : (
          <MindMapTab />
        )}
      </main>
      
      <footer>
        <p>&copy; {new Date().getFullYear()} Antigravity Patent Solutions. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default App
