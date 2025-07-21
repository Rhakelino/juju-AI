import { useEffect, useState } from 'react';
import { requestToGroq } from './utils/groq';
import AOS from 'aos';
import 'aos/dist/aos.css';

function App() {
  const [conversations, setConversations] = useState(() => {
    const savedConversations = localStorage.getItem('conversations');
    return savedConversations ? JSON.parse(savedConversations) : [{
      id: 'default',
      title: 'Chat Baru',
      messages: []
    }];
  });
  const [activeConversationId, setActiveConversationId] = useState(() => {
    return localStorage.getItem('activeConversationId') || 'default';
  });
  const [loading, setLoading] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isDarkMode] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [typingMessage, setTypingMessage] = useState({ id: null, text: '' });
  const maxChars = 1000;

  const typeMessage = async (fullMessage, messageId) => {
    let currentText = '';
    setTypingMessage({ id: messageId, text: '' });
    
    for (let i = 0; i < fullMessage.length; i++) {
      if (messageId !== typingMessage.id) break; // Stop if new message started
      currentText += fullMessage[i];
      setTypingMessage({ id: messageId, text: currentText });
      await new Promise(resolve => setTimeout(resolve, 0.01)); // Adjust speed here
    }
    
    setTypingMessage({ id: null, text: '' });
  };

  const activeConversation = conversations.find(c => c.id === activeConversationId) || conversations[0];

  useEffect(() => {
    AOS.init({
      once: true,
      duration: 500
    });
  }, []);

  // Save conversations to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem('activeConversationId', activeConversationId);
  }, [activeConversationId]);

  const createNewChat = () => {
    const newId = Date.now().toString();
    const newConversation = {
      id: newId,
      title: 'Chat Baru',
      messages: []
    };
    setConversations(prev => [...prev, newConversation]);
    setActiveConversationId(newId);
  };

  const updateConversationTitle = (id, firstMessage) => {
    setConversations(prev => prev.map(conv => {
      if (conv.id === id && conv.title === 'Chat Baru') {
        // Ambil 30 karakter pertama dari pesan sebagai judul
        const title = firstMessage.length > 30 
          ? firstMessage.substring(0, 30) + '...'
          : firstMessage;
        return { ...conv, title };
      }
      return conv;
    }));
  };

  const handleSubmit = async () => {
    if (inputMessage.trim().length === 0 || inputMessage.length > maxChars) {
      alert(`Input harus antara 1 dan ${maxChars} karakter.`);
      return;
    }

    const userMessage = inputMessage.trim();
    const isFirstMessage = activeConversation.messages.length === 0;
    
    setConversations(prev => prev.map(conv => {
      if (conv.id === activeConversationId) {
        return {
          ...conv,
          messages: [...conv.messages, { id: Date.now().toString(), text: userMessage, isUser: true }]
        };
      }
      return conv;
    }));

    if (isFirstMessage) {
      updateConversationTitle(activeConversationId, userMessage);
    }

    setInputMessage('');
    setLoading(true);

    try {
      const ai = await requestToGroq(userMessage, activeConversation.messages);
      const messageId = Date.now().toString();
      
      // Start typing animation
      setTypingMessage({ id: messageId, text: '' });
      let currentText = '';
      
      // Type the message character by character
      for (let i = 0; i < ai.length; i++) {
        currentText += ai[i];
        setTypingMessage({ id: messageId, text: currentText });
        await new Promise(resolve => setTimeout(resolve, 0.01)); // Adjust speed here
      }
      
      // After typing is complete, add the full message to conversations
      setConversations(prev => prev.map(conv => {
        if (conv.id === activeConversationId) {
          return {
            ...conv,
            messages: [...conv.messages, { id: messageId, text: ai, isUser: false }]
          };
        }
        return conv;
      }));
      
      // Clear typing message
      setTypingMessage({ id: null, text: '' });
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Terjadi kesalahan saat memproses permintaan Anda.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-screen bg-neutral-900 relative">
      {/* Mobile Sidebar Toggle */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="lg:hidden fixed top-4 right-1 z-50 py-2 px-4 bg-neutral-800 rounded-md text-white"
      >
        {isSidebarOpen ? 'X' : '☰'}
      </button>

      {/* Sidebar */}
      <div className={`
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
        fixed lg:static
        w-64 h-full
        bg-neutral-800 text-white p-4
        flex flex-col
        transition-transform duration-300 ease-in-out
        z-40
      `}>
        <div className="text-2xl font-bold mb-6">Juju AI</div>
        <button
          onClick={() => {
            createNewChat();
            setIsSidebarOpen(false);
          }}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-2 px-4 mb-4 flex items-center justify-center space-x-2"
        >
          <span>+</span>
          <span>Chat Baru</span>
        </button>
        <div className="flex-1 overflow-y-auto space-y-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => {
                setActiveConversationId(conv.id);
                setIsSidebarOpen(false);
              }}
              className={`flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-neutral-700 ${
                conv.id === activeConversationId ? 'bg-neutral-700' : ''
              }`}
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="w-6 h-6">💬</div>
                <div className="truncate">{conv.title}</div>
              </div>
              {conv.id === activeConversationId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Apakah Anda yakin ingin menghapus chat ini?')) {
                      setConversations(prev => prev.filter(c => c.id !== conv.id));
                      if (prev.length > 0) {
                        setActiveConversationId(prev[0].id);
                      } else {
                        createNewChat();
                      }
                    }
                  }}
                  className="ml-2 text-neutral-400 hover:text-white"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col w-full">
        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 pt-16 lg:pt-4">
          {activeConversation.messages.length === 0 && !loading ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-400">
              <img src="/avatar-profil.png" alt="AI" className="w-16 h-16 mb-6 rounded-full" data-aos="fade-down" />
              <h1 className="text-2xl font-bold mb-4" data-aos="fade-up">Welcome</h1>
              <p className="text-center mb-8 max-w-md" data-aos="fade-up" data-aos-delay="100">
                Saya adalah Juju AI yang siap membantu Anda. Silakan tanyakan apa saja yang ingin Anda ketahui.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl w-full px-4">
                <div 
                  onClick={() => {
                    setInputMessage('Bagaimana cara memulai belajar pemrograman?');
                    handleSubmit();
                  }}
                  className="bg-neutral-800 p-4 rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer" 
                  data-aos="fade-up" 
                  data-aos-delay="200"
                >
                  <h3 className="font-medium mb-2">🎯 Contoh</h3>
                  <p className="text-sm">"Bagaimana cara memulai belajar pemrograman?"</p>
                </div>
                <div 
                  onClick={() => {
                    setInputMessage('Jelaskan konsep dasar JavaScript untuk pemula');
                    handleSubmit();
                  }}
                  className="bg-neutral-800 p-4 rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer" 
                  data-aos="fade-up" 
                  data-aos-delay="300"
                >
                  <h3 className="font-medium mb-2">💡 Contoh</h3>
                  <p className="text-sm">"Jelaskan konsep dasar JavaScript untuk pemula"</p>
                </div>
                <div 
                  onClick={() => {
                    setInputMessage('Bagaimana cara membuat aplikasi web sederhana?');
                    handleSubmit();
                  }}
                  className="bg-neutral-800 p-4 rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer" 
                  data-aos="fade-up" 
                  data-aos-delay="400"
                >
                  <h3 className="font-medium mb-2">📝 Contoh</h3>
                  <p className="text-sm">"Bagaimana cara membuat aplikasi web sederhana?"</p>
                </div>
                <div 
                  onClick={() => {
                    setInputMessage('Apa perbedaan antara React dan Vue.js?');
                    handleSubmit();
                  }}
                  className="bg-neutral-800 p-4 rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer" 
                  data-aos="fade-up" 
                  data-aos-delay="500"
                >
                  <h3 className="font-medium mb-2">🔍 Contoh</h3>
                  <p className="text-sm">"Apa perbedaan antara React dan Vue.js?"</p>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {activeConversation.messages.map((message, index) => (
            <div key={index} className="mb-6">
              <div className={`flex items-start ${message.isUser ? 'justify-end' : 'justify-start'}`}>
                {!message.isUser && (
                  <div className="flex-shrink-0 mr-3">
                    <img
                      src="/avatar-profil.png"
                      alt="AI"
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  </div>
                )}
                <div className={`flex flex-col ${message.isUser ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-2 rounded-lg max-w-[85vw] lg:max-w-2xl ${
                    message.isUser 
                      ? 'bg-violet-600 text-white rounded-br-none' 
                      : 'bg-neutral-800 text-white rounded-bl-none'
                  }`}>
                    <div className="whitespace-pre-wrap break-words">
                      {typingMessage.id === message.id ? typingMessage.text : message.text}
                      {typingMessage.id === message.id && (
                        <span className="inline-block w-1 h-4 ml-1 bg-white animate-pulse"></span>
                      )}
                    </div>
                  </div>
                  <div className={`text-xs text-neutral-500 mt-1 ${message.isUser ? 'text-right' : 'text-left'}`}>
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {message.isUser && (
                  <div className="flex-shrink-0 ml-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center text-white text-sm">
                      You
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
            </div>
          )}
          
          {/* Typing message */}
          {typingMessage.id && (
            <div className="mb-6">
              <div className="flex items-start justify-start">
                <div className="flex-shrink-0 mr-3">
                  <img
                    src="/avatar-profil.png"
                    alt="AI"
                    className="w-8 h-8 rounded-full object-cover"
                  />
                </div>
                <div className="flex flex-col items-start">
                  <div className="px-4 py-2 rounded-lg max-w-[85vw] lg:max-w-2xl bg-neutral-800 text-white rounded-bl-none">
                    <div className="whitespace-pre-wrap">
                      {typingMessage.text}
                      <span className="inline-block w-1 h-4 ml-1 bg-white animate-pulse"></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Container */}
        <div className="p-4 border-t border-neutral-700">
          <div className="relative max-w-4xl mx-auto px-2 lg:px-0">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Tanyakan apa saja, @ model / perintah"
              className="w-full bg-neutral-800 text-white rounded-lg pl-4 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500"
              maxLength={maxChars}
            />
            <button
              onClick={handleSubmit}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
