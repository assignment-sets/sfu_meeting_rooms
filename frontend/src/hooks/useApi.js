import axios from "axios";
import { useAuth } from "@clerk/react";

export function useApi() {
  const { getToken } = useAuth();

  const api = axios.create({
    baseURL: import.meta.env.VITE_SIGNALING_SERVER_URL,
  });

  // Automatically attach Clerk bearer token on every request
  api.interceptors.request.use(
    async (config) => {
      try {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.error("Axios Interceptor: Error fetching auth token", error);
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  return api;
}
