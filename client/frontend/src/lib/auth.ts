import { apiPost } from "@/lib/api";

export type User = {
  id: number;
  login: string;
  avatar_url: string;
  name: string | null;
  email: string | null;
};

export async function getCurrentUser(): Promise<User | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) return null;
  const data: { user: User } = await res.json();
  return data.user;
}

export async function logout(): Promise<void> {
  await apiPost<{ status: string }>("/auth/logout");
}
