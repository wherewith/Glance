import "./App.css"
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

interface Message {
  text: string;
  isUser: boolean;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cleanup = async () => {
    try {
      await axios.post('http://127.0.0.1:5000/cleanup');
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
      navigator.sendBeacon('http://127.0.0.1:5000/cleanup');
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

      const formData = new FormData();
      formData.append('file', selectedFile);

      try {
        await axios.post('http://127.0.0.1:5000/upload_file', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        setPdfUrl(URL.createObjectURL(selectedFile));
        setMessages([...messages, { text: 'PDF uploaded successfully!', isUser: false }]);
      } catch (error) {
        console.error('Error uploading file:', error);
        setMessages([...messages, { text: 'Error uploading PDF.', isUser: false }]);
      }
    }
  };


  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { text: input, isUser: true };
    setMessages([...messages, userMessage]);
    setInput('');

    try {
      const response = await axios.post('http://127.0.0.1:5000/ask_question', {
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
      <div className='flex relative w-1/2 p-4 justify-center items-center border-x'>
        {!pdfUrl ? (
          <>
            <input type="file" onChange={handleFileChangeAndUpload} accept=".pdf" className="absolute opacity-0 w-full h-full cursor-pointer" />
            <span>Click to upload a pdf!</span>
          </>
        ) : (
          <iframe src={`${pdfUrl}#toolbar=0`} className="absolute w-full h-full" />
        )}
      </div>
      <div className='flex relative w-1/2 flex-col mt-4 p-4'>
        <nav className="absolute z-[9999] right-0 top-0 mr-8 h-8 w-8">
          <button onClick={cleanup} className={`rounded-full w-full h-full flex justify-center items-center ${pdfUrl ? 'bg-blue-500' : "bg-neutral-300 pointer-events-none"}`}>
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
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleSendMessage())}
          />
          <button className={`flex items-end ${input ? '' : 'pointer-events-none'}`} onClick={handleSendMessage}>
            <svg
              className={`w-8 h-8 ${input ? 'fill-blue-500' : 'fill-neutral-300'}`}
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