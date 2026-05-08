// ==========================================
// CONFIGURATION & STATE
// ==========================================
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const HF_TOKEN = env.VITE_HF_TOKEN || '';
const NEWS_API_KEY = env.VITE_NEWS_API_KEY || '';
const HF_MODEL = 'meta-llama/Llama-3.1-8B-Instruct';

const state = {
    iss: {
        lat: 0,
        lon: 0,
        speed: 0,
        locationName: 'Unknown',
        path: [],
        count: 0,
        people: []
    },
    news: {
        articles: [],
        lastFetched: 0
    },
    chat: [],
    chartData: {
        labels: [],
        speeds: []
    }
};

let map, marker, polyline, speedChart;

// ==========================================
// PART 1: ISS TRACKING & CHART
// ==========================================

function initMap() {
    map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    const cyberIcon = L.divIcon({
        className: 'cyber-iss-icon',
        html: '<div style="background: #f0f; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 10px #f0f;"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });

    marker = L.marker([0, 0], { icon: cyberIcon }).addTo(map);
    polyline = L.polyline([], { color: '#0ff', weight: 2, dashArray: '5, 5' }).addTo(map);
}

function initChart() {
    const ctx = document.getElementById('speedChart').getContext('2d');
    
    // Cyberpunk theme for chart
    Chart.defaults.color = '#0ff';
    Chart.defaults.font.family = "'Rajdhani', sans-serif";

    speedChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: state.chartData.labels,
            datasets: [{
                label: 'ISS Speed (km/h)',
                data: state.chartData.speeds,
                borderColor: '#f0f',
                backgroundColor: 'rgba(255, 0, 255, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#0ff',
                pointBorderColor: '#0ff',
                pointRadius: 3,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(0, 255, 255, 0.1)' },
                    ticks: { maxRotation: 45, minRotation: 45 }
                },
                y: {
                    grid: { color: 'rgba(0, 255, 255, 0.1)' },
                    // Make it look dynamic like the reference
                    suggestedMin: 27000, 
                    suggestedMax: 28000
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#0ff' }
                }
            }
        }
    });
}

function updateChart(speed) {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    state.chartData.labels.push(timeStr);
    state.chartData.speeds.push(speed);

    // Keep last 15 points
    if (state.chartData.labels.length > 15) {
        state.chartData.labels.shift();
        state.chartData.speeds.shift();
    }

    // Adjust Y-axis scale dynamically based on data
    if (state.chartData.speeds.length > 0) {
        const minSpeed = Math.min(...state.chartData.speeds) - 100;
        const maxSpeed = Math.max(...state.chartData.speeds) + 100;
        speedChart.options.scales.y.min = minSpeed > 0 ? minSpeed : 0;
        speedChart.options.scales.y.max = maxSpeed;
    }

    speedChart.update();
}

// Haversine formula
function calculateSpeed(lat1, lon1, lat2, lon2, timeMs) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // in km
    
    const hours = timeMs / 1000 / 3600;
    return hours > 0 ? (distance / hours).toFixed(2) : 0;
}

async function fetchLocationName(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
        const data = await res.json();
        return data.error ? "Over Ocean / Remote Area" : (data.address.city || data.address.country || "Unknown Location");
    } catch {
        return "Over Ocean / Remote Area";
    }
}

let lastFetchTime = 0;
async function updateISS() {
    try {
        const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
        const data = await res.json();
        const lat = parseFloat(data.latitude);
        const lon = parseFloat(data.longitude);
        const now = Date.now();

        // Approximate base speed if it's the first fetch (ISS is roughly 27,600 km/h)
        let currentSpeed = 27600;

        // Speed calculation
        if (state.iss.path.length > 0 && lastFetchTime > 0) {
            const lastPos = state.iss.path[state.iss.path.length - 1];
            const calcSpeed = calculateSpeed(lastPos.lat, lastPos.lon, lat, lon, now - lastFetchTime);
            if(calcSpeed > 0) currentSpeed = parseFloat(calcSpeed);
        }

        state.iss.speed = currentSpeed;
        document.getElementById('iss-speed').innerText = currentSpeed;
        
        updateChart(currentSpeed);

        // Update Path
        state.iss.path.push({lat, lon});
        if (state.iss.path.length > 15) state.iss.path.shift();
        
        polyline.setLatLngs(state.iss.path.map(p => [p.lat, p.lon]));
        marker.setLatLng([lat, lon]);
        map.setView([lat, lon]);

        state.iss.lat = lat;
        state.iss.lon = lon;
        state.iss.count++;
        lastFetchTime = now;

        document.getElementById('iss-lat').innerText = lat.toFixed(4);
        document.getElementById('iss-lon').innerText = lon.toFixed(4);
        document.getElementById('iss-count').innerText = state.iss.count;

        // Fetch location name
        state.iss.locationName = await fetchLocationName(lat, lon);
        document.getElementById('iss-loc-name').innerText = state.iss.locationName;

    } catch (error) {
        console.error("ISS Error", error);
    }
}

async function fetchPeopleInSpace() {
    try {
        const res = await fetch('https://api.open-notify.org/astros.json');
        const data = await res.json();
        state.iss.people = data.people;
    } catch (e) {
        console.error(e);
    }
}


// ==========================================
// PART 2: NEWS DASHBOARD
// ==========================================

async function fetchNews() {
    const container = document.getElementById('news-container');
    const loading = document.getElementById('news-loading');
    
    // Check local storage
    const cachedStr = localStorage.getItem('cyber_news');
    if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (Date.now() - cached.timestamp < 15 * 60 * 1000) {
            state.news.articles = cached.data;
            renderNews();
            return;
        }
    }

    loading.style.display = 'block';
    container.innerHTML = '';

    try {
        let articles = [];

        if (NEWS_API_KEY) {
            const url = `https://newsdata.io/api/1/news?apikey=${NEWS_API_KEY}&language=en`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.results) {
                articles = data.results.slice(0, 10).map(a => ({
                    title: a.title,
                    source: a.source_id || 'newsdata',
                    author: a.creator ? a.creator[0] : 'Unknown Agent',
                    date: a.pubDate,
                    image: a.image_url || 'https://via.placeholder.com/120x120.png?text=NO+IMAGE',
                    desc: a.description ? a.description.substring(0, 150) + '...' : 'No data available.',
                    url: a.link
                }));
            }
        } else {
            // No API key configured (e.g., Vercel env not set): use public space news fallback.
            const fallbackRes = await fetch('https://api.spaceflightnewsapi.net/v4/articles/?limit=10');
            const fallbackData = await fallbackRes.json();
            if (fallbackData.results) {
                articles = fallbackData.results.map(a => ({
                    title: a.title,
                    source: a.news_site || 'spaceflightnews',
                    author: a.authors && a.authors[0] ? a.authors[0].name : 'Unknown Agent',
                    date: a.published_at,
                    image: a.image_url || 'https://via.placeholder.com/120x120.png?text=NO+IMAGE',
                    desc: a.summary ? a.summary.substring(0, 150) + '...' : 'No data available.',
                    url: a.url
                }));
            }
        }

        if (articles.length > 0) {
            state.news.articles = articles;
            localStorage.setItem('cyber_news', JSON.stringify({
                data: state.news.articles,
                timestamp: Date.now()
            }));
            renderNews();
        } else {
            container.innerHTML = `<div class="msg bot">API ERROR: No news records received.</div>`;
        }
    } catch (e) {
        container.innerHTML = `<div class="msg bot">API ERROR: Failed to decrypt news feed.</div>`;
    } finally {
        loading.style.display = 'none';
    }
}

function renderNews() {
    const container = document.getElementById('news-container');
    const search = document.getElementById('news-search').value.toLowerCase();
    const sort = document.getElementById('news-sort').value;

    let filtered = state.news.articles.filter(a => 
        a.title.toLowerCase().includes(search) || 
        a.source.toLowerCase().includes(search) || 
        a.author.toLowerCase().includes(search)
    );

    if (sort === 'date') {
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else {
        filtered.sort((a, b) => a.source.localeCompare(b.source));
    }

    // Limit to 5
    const toShow = filtered.slice(0, 5);

    container.innerHTML = toShow.map(a => `
        <div class="news-card">
            <img src="${a.image}" alt="news" class="news-img" onerror="this.src='https://via.placeholder.com/120x120.png?text=NO+IMAGE'">
            <div class="news-content">
                <h3>${a.title}</h3>
                <div class="news-meta">SOURCE: ${a.source} | AGENT: ${a.author} | DATE: ${new Date(a.date).toLocaleDateString()}</div>
                <p class="news-desc">${a.desc}</p>
                <a href="${a.url}" target="_blank" class="cyber-btn-small" style="display:inline-block; margin-top:10px; text-decoration:none;">READ MORE</a>
            </div>
        </div>
    `).join('');
}


// ==========================================
// PART 3: AI CHATBOT
// ==========================================

const chatBtn = document.getElementById('chatbot-toggle');
const chatWin = document.getElementById('chatbot-window');
const closeChat = document.getElementById('close-chat');
const sendBtn = document.getElementById('send-btn');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

chatBtn.addEventListener('click', () => chatWin.classList.remove('hidden'));
closeChat.addEventListener('click', () => chatWin.classList.add('hidden'));

function loadChat() {
    const cached = localStorage.getItem('cyber_chat');
    if (cached) {
        state.chat = JSON.parse(cached);
        renderChat();
    }
}

function saveChat() {
    if (state.chat.length > 30) state.chat = state.chat.slice(-30);
    localStorage.setItem('cyber_chat', JSON.stringify(state.chat));
}

function renderChat() {
    chatMessages.innerHTML = state.chat.map(m => {
        const safeText = m.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        return `
        <div class="msg ${m.role}">
            <strong>${m.role === 'user' ? 'YOU' : 'AI'}:</strong> ${safeText}
        </div>
        `;
    }).join('');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addTyping() {
    const id = 'typing-' + Date.now();
    chatMessages.insertAdjacentHTML('beforeend', `<div id="${id}" class="typing-indicator">AI is computing...</div>`);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return id;
}

function removeTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function getLocalDashboardReply(text) {
    const q = text.toLowerCase();
    if (/\b(hi|hii|hello|hey|hloo|hola)\b/.test(q)) {
        return `Hello commander. ISS is at ${state.iss.lat.toFixed(2)}, ${state.iss.lon.toFixed(2)} traveling ${state.iss.speed} km/h.`;
    }
    if (/\b(thank|thanks)\b/.test(q)) {
        return 'Anytime. Ask me ISS status, people in space, or top news.';
    }
    if (q.includes('help') || q.includes('what can you do')) {
        return 'I can report ISS speed/location, people in space, and summarize top news from the live dashboard.';
    }
    if (q.includes('iss') && q.includes('speed')) return `ISS speed is ${state.iss.speed} km/h.`;
    if (q.includes('latitude') || q.includes('lat')) return `ISS latitude is ${state.iss.lat}.`;
    if (q.includes('longitude') || q.includes('lon')) return `ISS longitude is ${state.iss.lon}.`;
    if (q.includes('location') || q.includes('where')) return `ISS location is ${state.iss.locationName}.`;
    if (q.includes('people') || q.includes('astronaut')) return `People in space: ${state.iss.people.length || 0}.`;
    if (q.includes('news')) {
        const top = state.news.articles[0];
        return top ? `Top headline: ${top.title}` : 'News data is not loaded yet.';
    }
    return 'I am online in local mode. Ask about ISS speed/location, astronauts in space, or latest news.';
}

async function handleChat() {
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    state.chat.push({ role: 'user', text });
    renderChat();
    saveChat();

    const typingId = addTyping();

    const newsSummary = state.news.articles.slice(0, 3).map(a => `- ${a.title}`).join('\n');
    const systemPrompt = `You are an AI assistant in a Cyberpunk dashboard. You must answer questions ONLY based on the provided dashboard context. Do NOT use outside knowledge. If the answer is not in the context, say "Data not found in system." Be concise.
    
Context:
ISS Latitude: ${state.iss.lat}
ISS Longitude: ${state.iss.lon}
ISS Speed: ${state.iss.speed} km/h
ISS Location: ${state.iss.locationName}
Number of people in space: ${state.iss.people.length || 0}
Recent News:
${newsSummary}`;

    try {
        if (!HF_TOKEN) {
            removeTyping(typingId);
            const localReply = getLocalDashboardReply(text);
            state.chat.push({ role: 'bot', text: localReply });
            renderChat();
            saveChat();
            return;
        }

        const res = await fetch(`https://router.huggingface.co/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: HF_MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: text }
                ],
                max_tokens: 150,
                temperature: 0.5
            })
        });

        const data = await res.json();
        removeTyping(typingId);
        
        let reply = '';
        if (data?.choices?.[0]?.message?.content) {
            reply = data.choices[0].message.content;
        } else if (data?.choices?.[0]?.text) {
            reply = data.choices[0].text;
        } else if (typeof data?.generated_text === 'string') {
            reply = data.generated_text;
        } else if (Array.isArray(data) && typeof data?.[0]?.generated_text === 'string') {
            reply = data[0].generated_text;
        } else if (data?.error?.message) {
            reply = `AI API error: ${data.error.message}`;
        } else if (data?.message && typeof data.message === 'string') {
            reply = data.message;
        }

        // Strip out <think> tags from models that emit hidden reasoning.
        reply = (reply || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (!reply) reply = getLocalDashboardReply(text);

        state.chat.push({ role: 'bot', text: reply });
        renderChat();
        saveChat();

    } catch (e) {
        removeTyping(typingId);
        state.chat.push({ role: 'bot', text: getLocalDashboardReply(text) });
        renderChat();
        saveChat();
    }
}

sendBtn.addEventListener('click', handleChat);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChat();
});

document.getElementById('clear-chat').addEventListener('click', () => {
    state.chat = [];
    localStorage.removeItem('cyber_chat');
    renderChat();
});

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initChart();
    fetchPeopleInSpace();
    updateISS();
    setInterval(updateISS, 15000); // 15 seconds
    
    document.getElementById('refresh-iss').addEventListener('click', updateISS);
    
    fetchNews();
    document.getElementById('refresh-news').addEventListener('click', () => {
        localStorage.removeItem('cyber_news'); // force fetch
        fetchNews();
    });
    
    document.getElementById('news-search').addEventListener('input', renderNews);
    document.getElementById('news-sort').addEventListener('change', renderNews);

    loadChat();
});
