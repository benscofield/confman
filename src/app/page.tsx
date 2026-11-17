import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAccessTokenFromCookies } from "@/lib/auth-cookies";

export default async function HomePage() {
  const cookieStore = await cookies();
  const loggedIn = getAccessTokenFromCookies(cookieStore.getAll()) !== null;

  redirect(loggedIn ? "/conferences" : "/login");
}
