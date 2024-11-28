import { useEffect, useState } from 'react';
import { requestToGroq } from './utils/groq';
import { Light as SyntaxHighlight } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import loadingGif from './assets/images/loading.gif';
import AOS from 'aos';
import 'aos/dist/aos.css';

function App() {
  const [data, setData] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isCode = (text) => {
    // Fungsi sederhana untuk mendeteksi apakah teks adalah kode
    const codePatterns = ['{', '}', 'function', '=>', 'const', 'let', 'var', 'return', ';'];
    return codePatterns.some((pattern) => text.includes(pattern));
  };

  useEffect(() => {
    AOS.init({
      once: true,
      duration: 500
    })
  })

  const handleSubmit = async () => {
    const content = document.getElementById('content');
    const inputValue = content?.value.trim();

    setLoading(true);
    setSubmitted(true);
    setData('');

    try {
      const ai = await requestToGroq(inputValue, { language: 'ID' });
      setData(ai);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Terjadi kesalahan saat memproses permintaan Anda.');
    } finally {
      setLoading(false);
      content.value = '';
    }
  };


  const handleKeyEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <main className="flex justify-center min-h-screen items-center bg-neutral-800">
      <div className="w-full max-w-3xl m-4">
        <h1
          className="text-4xl text-white font-bold text-center mb-4"
          data-aos="fade-down"
          data-aos-duration="1000"
        >Juju AI (beta)</h1>
        <input
          type="text"
          className="w-full py-2 px-4 rounded-full bg-neutral-700 text-white mb-3 placeholder:opacity-50"
          id="content"
          onKeyDown={handleKeyEnter}
          placeholder="Ketik Pertanyaan..."
          data-aos="zoom-in"
          autoComplete='off'
        />
        <button
          className="w-full text-white bg-violet-700 py-2 px-2 rounded-full hover:bg-violet-600 transition duration-200"
          onClick={handleSubmit}
          data-aos="fade-up"
        >
          Kirim
        </button>
        {/* Hanya tampilkan hasil jika data tersedia */}
        {submitted && (
          <div className="w-full mt-4 p-4 bg-neutral-700 rounded-lg tracking-normal leading-loose">
            {loading ? (
              <div className="flex justify-center items-center">
                <img src={loadingGif} alt="Loading..." className="w-16 h-16" />
              </div>
            ) : data ? (
              isCode(data) ? (
                <SyntaxHighlight language="javascript" style={oneDark} wrapLongLines={true}>
                  {data}
                </SyntaxHighlight>
              ) : (
                <div className="text-white">{data}</div>
              )
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

export default App;
