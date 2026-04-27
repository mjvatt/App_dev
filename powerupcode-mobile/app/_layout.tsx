import React, { useEffect, useState } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { isAuthenticated } from "@/lib/auth";

export default function RootLayout() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    isAuthenticated().then((authed) => {
      if (authed) {
        router.replace("/(app)/dashboard");
      } else {
        router.replace("/(auth)/login");
      }
      setChecked(true);
    });
  }, []);

  if (!checked) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
