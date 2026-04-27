import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Linking,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authedRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { colors, fontSize, spacing, radius } from "@/lib/theme";

interface BillingStatus {
  plan: "free" | "weekly" | "monthly" | "annual";
  status: "active" | "inactive" | "canceled";
  current_period_end?: string;
}

interface CheckoutResponse {
  checkout_url: string;
}

const PLANS = [
  { key: "weekly", label: "Weekly", price: "$2", period: "/week", description: "Great for a quick grind session." },
  { key: "monthly", label: "Monthly", price: "$5", period: "/month", description: "Best for consistent daily practice." },
  { key: "annual", label: "Annual", price: "$40", period: "/year", description: "Commit to the grind. Best value." },
] as const;

type PlanKey = typeof PLANS[number]["key"];

export default function BillingScreen() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<PlanKey | null>(null);
  const [error, setError] = useState("");

  const fetchStatus = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<BillingStatus>("/api/billing/status", token);
      setStatus(data);
    } catch {
      setError("Failed to load billing status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleSubscribe(plan: PlanKey) {
    setCheckingOut(plan);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<CheckoutResponse>("/api/billing/create-checkout-session", token, {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      await Linking.openURL(data.checkout_url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setCheckingOut(null);
    }
  }

  const isPremium = status?.plan !== "free" && status?.status === "active";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchStatus} tintColor={colors.primary} />}
      >
        <Text style={styles.screenTitle}>Plan</Text>

        {loading && <ActivityIndicator color={colors.primary} style={styles.loader} />}

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {status && (
          <Card style={[styles.currentPlan, isPremium && styles.premiumBorder]}>
            <Text style={styles.currentPlanLabel}>Current plan</Text>
            <Text style={styles.currentPlanName}>
              {status.plan.charAt(0).toUpperCase() + status.plan.slice(1)}
            </Text>
            <View style={[styles.statusBadge, isPremium ? styles.activeBadge : styles.inactiveBadge]}>
              <Text style={[styles.statusText, isPremium ? styles.activeText : styles.inactiveText]}>
                {isPremium ? "Active" : "Free tier"}
              </Text>
            </View>
            {status.current_period_end && (
              <Text style={styles.renewText}>
                Renews {new Date(status.current_period_end).toLocaleDateString()}
              </Text>
            )}
          </Card>
        )}

        {!isPremium && (
          <>
            <Text style={styles.sectionTitle}>Upgrade to unlock Medium, Hard & Boss challenges</Text>
            {PLANS.map((plan) => (
              <Card key={plan.key} style={styles.planCard}>
                <View style={styles.planHeader}>
                  <View>
                    <Text style={styles.planLabel}>{plan.label}</Text>
                    <Text style={styles.planDescription}>{plan.description}</Text>
                  </View>
                  <View style={styles.priceBlock}>
                    <Text style={styles.planPrice}>{plan.price}</Text>
                    <Text style={styles.planPeriod}>{plan.period}</Text>
                  </View>
                </View>
                <Button
                  label={checkingOut === plan.key ? "Opening…" : `Get ${plan.label}`}
                  onPress={() => handleSubscribe(plan.key)}
                  loading={checkingOut === plan.key}
                  disabled={checkingOut !== null}
                  fullWidth
                  variant="primary"
                  style={styles.planBtn}
                />
              </Card>
            ))}
          </>
        )}

        {isPremium && (
          <Card style={styles.featureList}>
            <Text style={styles.featureTitle}>Your benefits</Text>
            {["Unlimited Medium, Hard & Boss challenges", "AI-powered hints and feedback", "Full leaderboard participation", "Streak protection"].map((f) => (
              <View key={f} style={styles.featureRow}>
                <Text style={styles.featureCheck}>✓</Text>
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  screenTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "800" },
  loader: { marginVertical: spacing.xl },
  errorBox: {
    backgroundColor: "#3f0000",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  errorText: { color: colors.error, fontSize: fontSize.sm },
  currentPlan: { gap: spacing.xs },
  premiumBorder: { borderColor: colors.primary },
  currentPlanLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "600", letterSpacing: 1 },
  currentPlanName: { color: colors.text, fontSize: fontSize.xl, fontWeight: "700" },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.xs,
  },
  activeBadge: { backgroundColor: colors.success + "20" },
  inactiveBadge: { backgroundColor: colors.surface2 },
  statusText: { fontSize: fontSize.xs, fontWeight: "700" },
  activeText: { color: colors.success },
  inactiveText: { color: colors.textMuted },
  renewText: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.xs },
  sectionTitle: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: "600" },
  planCard: { gap: spacing.sm },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  planLabel: { color: colors.text, fontSize: fontSize.lg, fontWeight: "700" },
  planDescription: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2, maxWidth: 200 },
  priceBlock: { alignItems: "flex-end" },
  planPrice: { color: colors.primary, fontSize: fontSize.xxl, fontWeight: "800" },
  planPeriod: { color: colors.textMuted, fontSize: fontSize.xs },
  planBtn: { marginTop: spacing.xs },
  featureList: { gap: spacing.sm },
  featureTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: "700", marginBottom: spacing.xs },
  featureRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  featureCheck: { color: colors.success, fontWeight: "700", fontSize: fontSize.md },
  featureText: { color: colors.textMuted, fontSize: fontSize.sm, flex: 1 },
});
