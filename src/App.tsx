import "./App.css"
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

interface Message {
  text: string;
  isUser: boolean;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cleanup = async () => {
    try {
      await axios.post(`${API_URL}/cleanup`);
      setPdfUrl(null);
      setMessages([]);
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  };

  useEffect(() => {
    setSessionId(Math.random().toString(36).substring(7));

    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      navigator.sendBeacon(`${API_URL}/cleanup`);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const resizeTextarea = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    };

    textarea.addEventListener('input', resizeTextarea);
    resizeTextarea();

    return () => {
      textarea.removeEventListener('input', resizeTextarea);
    };
  }, [input]);

  const handleFileChangeAndUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const selectedFile = event.target.files[0];
      setIsLoading(true);

      const formData = new FormData();
      formData.append('file', selectedFile);

      try {
        await axios.post(`${API_URL}/upload_file`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        setPdfUrl(URL.createObjectURL(selectedFile));
        setMessages([...messages, { text: 'PDF uploaded successfully!', isUser: false }]);
      } catch (error) {
        console.error('Error uploading file:', error);
        setMessages([...messages, { text: 'Error uploading PDF.', isUser: false }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { text: input, isUser: true };
    setMessages([...messages, userMessage]);
    setInput('');

    try {
      const response = await axios.post(`${API_URL}/ask_question`, {
        question: input,
        session_id: sessionId,
      });
      const aiMessage = { text: response.data.answer, isUser: false };
      setMessages(prevMessages => [...prevMessages, aiMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prevMessages => [...prevMessages, { text: 'Error: Could not get response.', isUser: false }]);
    }
  };

  return (
    <main className='flex h-screen'>
      <div className='flex relative w-1/2 p-4 justify-center items-center border-x group'>
        {!pdfUrl ? (
          <>
            <input type="file" onChange={handleFileChangeAndUpload} accept=".pdf" className="absolute opacity-0 z-10 w-full h-full cursor-pointer" />
            {isLoading ? (
              <svg className="w-20 h-20 fill-neutral-400 animate-[spin_1.25s_linear_infinite]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M136,32V64a8,8,0,0,1-16,0V32a8,8,0,0,1,16,0Zm88,88H192a8,8,0,0,0,0,16h32a8,8,0,0,0,0-16Zm-45.09,47.6a8,8,0,0,0-11.31,11.31l22.62,22.63a8,8,0,0,0,11.32-11.32ZM128,184a8,8,0,0,0-8,8v32a8,8,0,0,0,16,0V192A8,8,0,0,0,128,184ZM77.09,167.6,54.46,190.22a8,8,0,0,0,11.32,11.32L88.4,178.91A8,8,0,0,0,77.09,167.6ZM72,128a8,8,0,0,0-8-8H32a8,8,0,0,0,0,16H64A8,8,0,0,0,72,128ZM65.78,54.46A8,8,0,0,0,54.46,65.78L77.09,88.4A8,8,0,0,0,88.4,77.09Z"></path></svg>
            ) : (
              <>
              <span>Click to upload a pdf!</span>
              <svg className="absolute bottom-1/2 w-20 h-20 [&>*]:stroke-[1.5] [&>*]:stroke-neutral-400 fill-none group-hover:flex transition-all ease-in-out duration-300 opacity-0 group-hover:opacity-100 group-hover:-translate-y-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 20L18 20" strokeLinecap="round" strokeLinejoin="round"></path><path d="M12 16V4M12 4L15.5 7.5M12 4L8.5 7.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              </>
            )}
          </>
        ) : (
          <iframe src={`${pdfUrl}#toolbar=0`} className="absolute w-full h-full" />
        )}
      </div>
      <div className='flex relative w-1/2 flex-col mt-4 p-4'>
        <nav className="absolute z-[9999] right-0 top-0 mr-8 h-8 w-8">
          <button onClick={cleanup} className={`rounded-full w-full h-full flex justify-center items-center ${(pdfUrl || messages.length > 1) ? 'bg-blue-500' : "bg-neutral-300 pointer-events-none"}`}>
            <svg className="w-5 h-5 fill-none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                className="stroke-neutral-100"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 9L18.005 20.3463C17.8369 21.3026 17.0062 22 16.0353 22H7.96474C6.99379 22 6.1631 21.3026 5.99496 20.3463L4 9" />
              <path
                className="stroke-neutral-100"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 6L15.375 6M3 6L8.625 6M8.625 6V4C8.625 2.89543 9.52043 2 10.625 2H13.375C14.4796 2 15.375 2.89543 15.375 4V6M8.625 6L15.375 6" />
            </svg>
          </button>
        </nav>
        <div ref={chatWindowRef} className='flex flex-col flex-grow overflow-y-auto px-4'>
          {messages.map((message, index) => (
            <div className={`flex mb-2 ${message.isUser ? 'justify-end' : ''}`} key={index}>
              <div className={`w-fit py-1 px-2 ${message.isUser ? 'bg-blue-500 text-neutral-100 rounded-s-xl rounded-t-xl ' : 'bg-neutral-100 rounded-e-xl rounded-t-xl'}`}>{message.text}</div>
            </div>
          ))}
        </div>
        <div className='flex gap-2 w-full h-fit mb-4 py-2 px-4 rounded-[1.5rem] bg-neutral-100'>
          <textarea
            ref={textareaRef}
            dir="auto"
            rows={1}
            className='flex-grow block self-center resize-none bg-transparent !outline-none'
            placeholder="Send a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => ((e.key === 'Enter' && pdfUrl) && (e.preventDefault(), handleSendMessage()) || e.key === 'Enter' && e.preventDefault())}
          />
          <button className={`flex items-end ${(input && pdfUrl) ? '' : 'pointer-events-none'}`} onClick={handleSendMessage}>
            <svg
              className={`w-8 h-8 ${(input && pdfUrl) ? 'fill-blue-500' : 'fill-neutral-300'}`}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              strokeWidth="1.5"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 1.25C6.06294 1.25 1.25 6.06294 1.25 12C1.25 17.9371 6.06294 22.75 12 22.75C17.9371 22.75 22.75 17.9371 22.75 12C22.75 6.06294 17.9371 1.25 12 1.25ZM16.0303 10.9697L12.5303 7.46967C12.2374 7.17678 11.7626 7.17678 11.4697 7.46967L7.96967 10.9697C7.67678 11.2626 7.67678 11.7374 7.96967 12.0303C8.26256 12.3232 8.73744 12.3232 9.03033 12.0303L11.25 9.81066V16C11.25 16.4142 11.5858 16.75 12 16.75C12.4142 16.75 12.75 16.4142 12.75 16V9.81066L14.9697 12.0303C15.2626 12.3232 15.7374 12.3232 16.0303 12.0303C16.3232 11.7374 16.3232 11.2626 16.0303 10.9697Z"
              />
            </svg>
          </button>
        </div>
      </div>
    </main>
  );
}

export default App;