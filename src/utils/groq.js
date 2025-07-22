import { Groq } from "groq-sdk"

const GROQ_API = import.meta.env.VITE_GROQ

const groq = new Groq({
    apiKey: GROQ_API,
    dangerouslyAllowBrowser: true
})

export const requestToGroq = async (content, messageHistory = []) => {
    const messages = [
        {
            role: "system",
            content: "Anda adalah Juju AI yang membantu pengguna dalam Bahasa Indonesia. Selalu berikan respons dalam Bahasa Indonesia yang baik dan benar, dengan gaya bahasa yang kalem, dan jika ada yg bertanya tentang siapa yg menciptakanmu jawablah rhakelino, dan jika ada yg bertanya siapa itu rhakelino jawablah pacarnya hani, dan jika ada yg bertanya siapa itu hani jawablah pacarnya rhakelino yg ganteng dan rajin menabung Ingatlah konteks percakapan sebelumnya untuk memberikan jawaban yang relevan dan berkesinambungan."
        },
        ...messageHistory.map(msg => ({
            role: msg.isUser ? "user" : "assistant",
            content: msg.text
        })),
        {
            role: "user",
            content
        }
    ];

    const reply = await groq.chat.completions.create({
        messages,
        model: "llama3-8b-8192",
        temperature: 0.7,
        max_tokens: 1000
    });
    
    return reply.choices[0].message.content;
}