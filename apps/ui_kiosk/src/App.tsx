import { useState, useEffect, useRef } from 'react';
import { Teleprompter } from './Teleprompter';
import { INITIAL_RENDER_MODEL, RenderModel } from './types';
import './App.css';

function App() {
  const [model, setModel] = useState<RenderModel>(INITIAL_RENDER_MODEL);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);

  const connect = () => {
    const ws = new WebSocket('ws://localhost:8000');

    ws.onopen = () => {
      console.log('Connected to Device Daemon');
      // Reset model status just to be clean, though backend will send updates soon
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setModel(data);
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      console.log('Disconnected. Reconnecting in 2s...');
      setModel(prev => ({ ...prev, status: "DISCONNECTED" }));
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('WS Error:', err);
      ws.close();
    };

    return ws;
  };

  useEffect(() => {
    const ws = connect();
    return () => {
      ws.close();
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  return (
    <>
      <Teleprompter model={model} />
    </>
  );
}

export default App;
