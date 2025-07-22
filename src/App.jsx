import { useEffect, useState } from 'react';
import { requestToGroq } from './utils/groq';
import AOS from 'aos';
import 'aos/dist/aos.css';

function App() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
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
    try {
      const conversationsToSave = conversations.map(conv => ({
        ...conv,
        messages: conv.messages.map(msg => {
          // Jika pesan memiliki file, kita hanya simpan metadata
          if (msg.files && msg.files.length > 0) {
            return {
              ...msg,
              files: msg.files.map(file => ({
                name: file.name,
                type: file.type,
                // Tidak menyimpan content file di localStorage
                preview: file.type.startsWith('image/') ? file.content : null
              }))
            };
          }
          return msg;
        })
      }));
      localStorage.setItem('conversations', JSON.stringify(conversationsToSave));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      // Jika terjadi error, hapus data lama
      localStorage.removeItem('conversations');
    }
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

  const processFileContent = async (file) => {
    const fileData = { name: file.name, type: file.type };
    
    // Handle gambar
    if (file.type.startsWith('image/')) {
      fileData.description = `Sebuah gambar dengan nama ${file.name} dan tipe ${file.type}`;
    }
    // Baca file sebagai teks jika itu adalah file teks
    else if (file.type.startsWith('text/') || 
        ['.txt', '.md', '.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json', '.csv', '.pptx', '.doc', '.docx']
          .some(ext => file.name.toLowerCase().endsWith(ext))) {
      try {
        const textContent = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = (e) => reject(e);
          reader.readAsText(file);
        });
        fileData.textContent = textContent;
      } catch (e) {
        console.warn(`Tidak dapat membaca konten file ${file.name} sebagai teks:`, e);
      }
    }
    
    // Baca file sebagai DataURL untuk preview/download
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
    fileData.content = dataUrl;
    
    return fileData;
  };

  const createMessageContext = (text, files) => {
    let context = text || "Tolong analisis file yang saya kirimkan ini.";
    
    if (files?.length > 0) {
      const fileDescriptions = files.map(file => {
        let fileDesc = `\n\n=== File: ${file.name} ===\n`;
        if (file.textContent) {
          fileDesc += `${file.textContent}`;
        } else if (file.type.startsWith('image/')) {
          fileDesc += `[Ini adalah file gambar dengan format ${file.type}]`;
        } else {
          fileDesc += `[Ini adalah file dengan format ${file.type}]`;
        }
        return fileDesc;
      }).join('\n\n');

      context = `${context}\n\nBerikut adalah konten dari file yang diunggah:${fileDescriptions}\n\nMohon analisis file tersebut dan berikan respons yang sesuai dengan konteks dan isi file.`;
    }
    
    return context;
  };

  const handleSubmit = async () => {
    if (!selectedFiles.length && (inputMessage.trim().length === 0 || inputMessage.length > maxChars)) {
      alert(`Input harus antara 1 dan ${maxChars} karakter.`);
      return;
    }

    // Batasi jumlah file yang bisa diupload sekaligus
    if (selectedFiles.length > 5) {
      alert('Maksimal 5 file yang dapat dikirim sekaligus.');
      return;
    }

    const userMessage = inputMessage.trim();
    const isFirstMessage = activeConversation.messages.length === 0;
    
    let messageContent = {
      text: userMessage,
      files: []
    };

    if (selectedFiles.length > 0) {
      try {
        const filePromises = selectedFiles.map(processFileContent);
        messageContent.files = await Promise.all(filePromises);
        setSelectedFiles([]);
      } catch (error) {
        console.error('Error reading files:', error);
        alert('Gagal membaca file.');
        return;
      }
    }
    
    setConversations(prev => prev.map(conv => {
      if (conv.id === activeConversationId) {
        return {
          ...conv,
          messages: [...conv.messages, { 
            id: Date.now().toString(), 
            text: userMessage, 
            isUser: true,
            files: messageContent.files
          }]
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
      // Buat konteks pesan dengan informasi file
      const messageContext = createMessageContext(userMessage, messageContent.files);
      const ai = await requestToGroq(messageContext, activeConversation.messages);
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
      <div className="flex-1 flex flex-col w-full relative">
        {/* Messages Container */}
        <div 
          className={`flex-1 overflow-y-auto p-4 pt-16 lg:pt-4 pb-32 relative ${isDragging ? 'bg-neutral-800' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const files = Array.from(e.dataTransfer.files);

            // Cek total file yang akan diupload
            if (selectedFiles.length + files.length > 5) {
              alert('Maksimal 5 file yang dapat dikirim sekaligus.');
              return;
            }

            const validFiles = files.filter(file => file.size <= 5 * 1024 * 1024);
            if (validFiles.length !== files.length) {
              alert('Beberapa file terlalu besar. Maksimal ukuran file adalah 5MB.');
            }
            if (validFiles.length > 0) {
              setSelectedFiles(prev => [...prev, ...validFiles]);
            }
          }}
        >
          {isDragging && (
            <div className="absolute inset-0 bg-neutral-800 bg-opacity-90 flex items-center justify-center">
              <div className="text-white text-xl font-medium flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Drop file disini
              </div>
            </div>
          )}
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
                    {message.files && message.files.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.files.map((file, fileIndex) => (
                          <div key={fileIndex} className="p-2 bg-neutral-700 rounded-lg">
                            <div className="flex items-center space-x-2">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              <span className="text-sm text-neutral-300">{file.name}</span>
                              <a
                                href={file.content}
                                download={file.name}
                                className="text-violet-400 hover:text-violet-300 text-sm"
                              >
                                Download
                              </a>
                            </div>
                            {file.type.startsWith('image/') && (
                              <img
                                src={file.content}
                                alt={file.name}
                                className="max-w-xs max-h-48 mt-2 rounded-lg"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-neutral-900 p-4 border-t border-neutral-700">
          <div className="relative max-w-4xl mx-auto px-2 lg:px-0">
            {selectedFiles.length > 0 && (
              <div className="absolute bottom-full left-0 mb-2 p-2 bg-neutral-800 rounded-lg border border-neutral-700 w-full">
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center space-x-2 bg-neutral-700 rounded px-2 py-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span className="text-sm text-neutral-300">{file.name}</span>
                      <button
                        onClick={() => {
                          setSelectedFiles(files => files.filter((_, i) => i !== index));
                        }}
                        className="text-neutral-400 hover:text-white"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              placeholder={selectedFiles.length > 0 ? "Ketik pesan tambahan atau tekan enter untuk mengirim file" : "Tanyakan apa saja, @ model / perintah, atau drag & drop file kesini"}
              className="w-full bg-neutral-800 text-white rounded-lg pl-4 pr-24 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500"
              maxLength={maxChars}
            />
            <label className="absolute right-12 top-1/2 transform -translate-y-1/2 cursor-pointer">
              <input
                type="file"
                className="hidden"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files);
                  
                  // Cek total file yang akan diupload
                  if (selectedFiles.length + files.length > 5) {
                    alert('Maksimal 5 file yang dapat dikirim sekaligus.');
                    return;
                  }

                  const validFiles = files.filter(file => {
                    if (file.size > 5 * 1024 * 1024) { // 5MB limit
                      return false;
                    }
                    return true;
                  });
                  
                  if (validFiles.length !== files.length) {
                    alert('Beberapa file terlalu besar. Maksimal ukuran file adalah 5MB.');
                  }
                  
                  setSelectedFiles(prev => [...prev, ...validFiles]);
                }}
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-neutral-400 hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </label>
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
