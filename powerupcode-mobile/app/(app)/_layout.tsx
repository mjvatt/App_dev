import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

function tabIcon(focused: boolean, name: IoniconsName, outlineName: IoniconsName) {
  return (
    <Ionicons
      name={focused ? name : outlineName}
      size={22}
      color={focused ? colors.primary : colors.textMuted}
    />
  );
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => tabIcon(focused, "home", "home-outline"),
        }}
      />
      <Tabs.Screen
        name="arcade"
        options={{
          title: "Arcade",
          tabBarIcon: ({ focused }) => tabIcon(focused, "game-controller", "game-controller-outline"),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ focused }) => tabIcon(focused, "time", "time-outline"),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Ranks",
          tabBarIcon: ({ focused }) => tabIcon(focused, "trophy", "trophy-outline"),
        }}
      />
      <Tabs.Screen
        name="billing"
        options={{
          title: "Plan",
          tabBarIcon: ({ focused }) => tabIcon(focused, "card", "card-outline"),
        }}
      />
    </Tabs>
  );
}
