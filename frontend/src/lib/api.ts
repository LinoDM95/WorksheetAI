import axios from 'axios';
/** Etwas länger als GEMINI_TIMEOUT_SECONDS (10 Min.), damit der Browser nicht früher abbricht. */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  timeout: 660_000,
});
api.interceptors.request.use((config)=>{const t=localStorage.getItem('access'); if(t) config.headers.Authorization=`Bearer ${t}`; return config;});
