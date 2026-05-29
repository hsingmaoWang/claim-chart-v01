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
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      return;
    }
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

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
          <h1 className={activeTab === 'mindMap' ? 'title-mindmap' : 'title-claimchart'}>
             {activeTab === 'claimChart' ? 'Patent Claim Chart Generator' : 'Patent Mind Map Generator'}
          </h1>
          <p>
             {activeTab === 'claimChart' 
               ? 'Instantly transform patent documents into presentation-ready claim charts. Upload a PDF or paste a Google Patents URL to begin.' 
               : 'AI analyzes patent categories and automatically generates an interactive Patent Mind Map. Upload a patent portfolio Excel file or PDF file to start the analysis.'}
          </p>
        </div>
      </header>

      {/* Fixed Left Navigation */}
      <div 
        className="side-navigation" 
        onMouseDown={handleMouseDown}
        style={{ 
          position: 'fixed', 
          left: `calc(1rem + ${position.x}px)`, 
          top: `calc(50% + ${position.y}px)`, 
          transform: 'translateY(-50%)', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1rem', 
          padding: '1rem', 
          zIndex: 100, 
          background: 'rgba(0,0,0,0.4)', 
          backdropFilter: 'blur(10px)', 
          borderRadius: '1rem', 
          border: '1px solid var(--color-border)',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none'
        }}
      >
          {/* Subtle drag handle grid */}
          <div 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: '3px', 
              padding: '2px 0 6px', 
              cursor: 'grab', 
              opacity: 0.5 
            }}
          >
            <div style={{ display: 'flex', gap: '3px' }}>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'white' }}></span>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'white' }}></span>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'white' }}></span>
            </div>
            <div style={{ display: 'flex', gap: '3px' }}>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'white' }}></span>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'white' }}></span>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'white' }}></span>
            </div>
          </div>

          <button 
            className={activeTab === 'claimChart' ? 'btn-primary' : 'btn-secondary'} 
            onClick={() => setActiveTab('claimChart')}
            style={{ width: '150px', padding: '1rem', borderRadius: '0.5rem', fontWeight: 'bold' }}
          >
            Claim Chart
          </button>
          <button 
            className={activeTab === 'mindMap' ? 'btn-primary' : 'btn-secondary'} 
            onClick={() => setActiveTab('mindMap')}
            style={{ width: '150px', padding: '1rem', borderRadius: '0.5rem', fontWeight: 'bold', wordWrap: 'break-word', whiteSpace: 'normal', lineHeight: '1.2' }}
          >
            專利類別心智圖
          </button>
      </div>

      <main className="main-content" style={{ marginLeft: 'auto', marginRight: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <div style={{ width: '100%', display: activeTab === 'claimChart' ? 'flex' : 'none', flexDirection: 'column', alignItems: 'center' }}>
          {appState === 'idle' && (
            <div className="input-section animate-fade-in" style={{ animationDelay: '0.1s', width: '100%', maxWidth: '800px' }}>
              <UploadZone onUpload={(file) => handleProcessStart('file', file)} />
              
              <div className="divider">
                <span>OR</span>
              </div>
              
              <UrlInput onSubmit={(url) => handleProcessStart('url', url)} />
            </div>
          )}

          {appState === 'processing' && (
            <div className="processing-section animate-fade-in" style={{
              width: '100%',
              maxWidth: '800px',
              display: 'flex',
              justifyContent: 'center'
            }}>
               <Loader statusMessage="Extracting claims and figures..." />
            </div>
          )}

          {appState === 'complete' && (
            <div className="result-section animate-fade-in" style={{
              width: '100%',
              maxWidth: '800px',
              display: 'flex',
              justifyContent: 'center'
            }}>
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
             <div className="error-section animate-fade-in" style={{
               width: '100%',
               maxWidth: '800px',
               display: 'flex',
               justifyContent: 'center'
             }}>
                <div className="error-card">
                    <h3>Processing Failed</h3>
                    <p>{errorMessage}</p>
                    <button className="btn-secondary" onClick={handleReset}>Try Again</button>
                </div>
             </div>
          )}
        </div>

        <div style={{ width: '100%', display: activeTab === 'mindMap' ? 'flex' : 'none', justifyContent: 'center' }}>
           <MindMapTab />
        </div>
      </main>
      
      <footer style={{ textAlign: 'center', width: '100%', marginTop: '2rem' }}>
        <p>&copy; {new Date().getFullYear()} Antigravity Patent Solutions. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default App
