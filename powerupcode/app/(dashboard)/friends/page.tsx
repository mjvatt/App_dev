"use client";

import { useEffect, useState } from "react";
import { ApiError, authedRequest } from "@/lib/api";
import type {
  FriendLeaderboardResponse,
  FriendRequestsResponse,
  FriendsListResponse,
  FriendshipEntry,
  TokenGiftResponse,
  UserProgress,
  UserSearchEntry,
  UserSearchResponse,
} from "@/lib/types";

type Tab = "friends" | "requests" | "find";

const GIFT_MIN = 1;
const GIFT_MAX = 25;

export default function FriendsPage() {
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<FriendshipEntry[] | null>(null);
  const [incoming, setIncoming] = useState<FriendshipEntry[]>([]);
  const [outgoing, setOutgoing] = useState<FriendshipEntry[]>([]);
  const [board, setBoard] = useState<FriendLeaderboardResponse | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    authedRequest<FriendsListResponse>("/api/friends")
      .then((r) => setFriends(r.friends))
      .catch(() => setFriends([]));
    authedRequest<FriendRequestsResponse>("/api/friends/requests")
      .then((r) => {
        setIncoming(r.incoming);
        setOutgoing(r.outgoing);
      })
      .catch(() => null);
    authedRequest<FriendLeaderboardResponse>("/api/friends/leaderboard")
      .then(setBoard)
      .catch(() => null);
    authedRequest<UserProgress>("/api/progress/me")
      .then((p) => setTokenBalance(p.token_balance))
      .catch(() => null);
  }, [refreshKey]);

  function refresh() {
    setRefreshKey((n) => n + 1);
  }

  function applyGiftResult(result: TokenGiftResponse) {
    setTokenBalance(result.sender_token_balance);
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">Friends</h1>

      <div className="flex items-center gap-1 mb-6 border-b border-zinc-900 pb-2">
        <TabButton active={tab === "friends"} onClick={() => setTab("friends")}>
          Friends {friends && friends.length > 0 && (
            <span className="ml-1 text-zinc-500">({friends.length})</span>
          )}
        </TabButton>
        <TabButton active={tab === "requests"} onClick={() => setTab("requests")}>
          Requests {incoming.length > 0 && (
            <span className="ml-1 text-yellow-400">({incoming.length})</span>
          )}
        </TabButton>
        <TabButton active={tab === "find"} onClick={() => setTab("find")}>
          Find people
        </TabButton>
      </div>

      {tab === "friends" && (
        <FriendsTab
          board={board}
          onChange={refresh}
          tokenBalance={tokenBalance}
          onGifted={applyGiftResult}
        />
      )}
      {tab === "requests" && (
        <RequestsTab incoming={incoming} outgoing={outgoing} onChange={refresh} />
      )}
      {tab === "find" && <FindTab onChange={refresh} outgoing={outgoing} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? "text-white bg-zinc-900" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function FriendsTab({
  board,
  onChange,
  tokenBalance,
  onGifted,
}: {
  board: FriendLeaderboardResponse | null;
  onChange: () => void;
  tokenBalance: number | null;
  onGifted: (result: TokenGiftResponse) => void;
}) {
  if (board === null) {
    return <p className="text-zinc-500 text-sm">Loading…</p>;
  }
  if (board.entries.length <= 1) {
    return (
      <p className="text-zinc-500 text-sm">
        No friends yet. Add someone from the &ldquo;Find people&rdquo; tab.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {tokenBalance !== null && (
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs text-zinc-500">
            Send tokens to a friend — capped at {GIFT_MAX} per gift, one gift per friend per day.
          </p>
          <p className="text-xs text-amber-300 tabular-nums">
            {tokenBalance} ⚡ available
          </p>
        </div>
      )}
      <div className="hidden md:grid grid-cols-[3rem_1fr_5rem_7rem_5rem_8rem] gap-4 px-5 mb-2">
        <span className="text-xs text-zinc-600 font-medium">#</span>
        <span className="text-xs text-zinc-600 font-medium">Player</span>
        <span className="text-xs text-zinc-600 font-medium text-right">Level</span>
        <span className="text-xs text-zinc-600 font-medium text-right">XP</span>
        <span className="text-xs text-zinc-600 font-medium text-right">Streak</span>
        <span className="text-xs text-zinc-600 font-medium text-right"></span>
      </div>
      {board.entries.map((entry) => (
        <div
          key={entry.username}
          className={`rounded-xl px-5 py-4 grid grid-cols-[3rem_1fr] md:grid-cols-[3rem_1fr_5rem_7rem_5rem_8rem] gap-4 items-center border ${
            entry.is_current_user
              ? "bg-zinc-900 border-zinc-700"
              : "bg-zinc-950 border-zinc-900"
          }`}
        >
          <span className="text-sm font-bold tabular-nums text-zinc-500">
            {entry.rank}
          </span>
          <div className="min-w-0">
            <span
              className={`text-sm font-medium truncate block ${
                entry.is_current_user ? "text-white" : "text-zinc-300"
              }`}
            >
              {entry.username}
              {entry.is_current_user && (
                <span className="ml-2 text-xs text-zinc-500 font-normal">you</span>
              )}
            </span>
            <span className="md:hidden text-xs text-zinc-500 mt-0.5 block tabular-nums">
              Lv {entry.level} · {entry.total_xp.toLocaleString()} XP · {entry.streak_days}d
            </span>
          </div>
          <span className="hidden md:block text-sm text-zinc-400 text-right tabular-nums">
            Lv {entry.level}
          </span>
          <span className="hidden md:block text-sm font-semibold text-yellow-400 text-right tabular-nums">
            {entry.total_xp.toLocaleString()} XP
          </span>
          <span className="hidden md:block text-sm text-zinc-500 text-right tabular-nums">
            {entry.streak_days}d
          </span>
          <span className="hidden md:flex justify-end items-center gap-3">
            {!entry.is_current_user && (
              <>
                <GiftFriendButton
                  username={entry.username}
                  tokenBalance={tokenBalance}
                  onGifted={onGifted}
                />
                <RemoveFriendButton username={entry.username} onChange={onChange} />
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function GiftFriendButton({
  username,
  tokenBalance,
  onGifted,
}: {
  username: string;
  tokenBalance: number | null;
  onGifted: (result: TokenGiftResponse) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(GIFT_MIN);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setAmount(GIFT_MIN);
    setError(null);
    setSuccess(null);
    setPending(false);
  }

  const balance = tokenBalance ?? 0;
  const cappedMax = Math.min(GIFT_MAX, balance);
  const valid = amount >= GIFT_MIN && amount <= cappedMax;

  async function send() {
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await authedRequest<TokenGiftResponse>(
        "/api/progress/gift-tokens",
        {
          method: "POST",
          body: JSON.stringify({ recipient_username: username, amount }),
        }
      );
      onGifted(result);
      setSuccess(`Sent ${result.amount} ⚡ to ${result.recipient_username}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not send gift.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-amber-300 hover:text-amber-200 transition-colors"
      >
        Gift ⚡
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div
            className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-white mb-1">
              Gift tokens to {username}
            </p>
            <p className="text-xs text-zinc-500 mb-5">
              Your balance: <span className="text-amber-300 tabular-nums">{balance} ⚡</span>
              {" · "}
              Max per gift: {GIFT_MAX} ⚡
            </p>

            <label className="block text-xs text-zinc-400 mb-1.5">Amount</label>
            <input
              type="number"
              min={GIFT_MIN}
              max={cappedMax}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              disabled={pending || !!success}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white tabular-nums focus:outline-none focus:border-white disabled:opacity-50"
            />

            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
            {success && <p className="text-xs text-emerald-400 mt-3">{success}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={close}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                {success ? "Close" : "Cancel"}
              </button>
              {!success && (
                <button
                  onClick={send}
                  disabled={!valid || pending}
                  className="px-3 py-1.5 bg-amber-500 text-black text-xs font-semibold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {pending ? "Sending…" : `Send ${amount} ⚡`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RemoveFriendButton({
  username,
  onChange,
}: {
  username: string;
  onChange: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleRemove() {
    if (!confirm(`Remove ${username} as a friend?`)) return;
    setPending(true);
    try {
      // Look up the friend's user_id via the friends list response is
      // overkill — easier: search by username, take the first hit.
      const search = await authedRequest<UserSearchResponse>(
        `/api/friends/search?q=${encodeURIComponent(username)}`
      );
      const target = search.results.find((r) => r.username === username);
      if (target) {
        await authedRequest(`/api/friends/${target.user_id}`, { method: "DELETE" });
      }
      onChange();
    } catch {
      // best-effort; UI re-renders on next refresh
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleRemove}
      disabled={pending}
      className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}

function RequestsTab({
  incoming,
  outgoing,
  onChange,
}: {
  incoming: FriendshipEntry[];
  outgoing: FriendshipEntry[];
  onChange: () => void;
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-semibold text-white mb-3">Incoming requests</h2>
        {incoming.length === 0 ? (
          <p className="text-sm text-zinc-500">No incoming requests.</p>
        ) : (
          <div className="space-y-2">
            {incoming.map((req) => (
              <RequestRow key={req.friendship_id} req={req} onChange={onChange} />
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="text-sm font-semibold text-white mb-3">Sent requests</h2>
        {outgoing.length === 0 ? (
          <p className="text-sm text-zinc-500">No pending sent requests.</p>
        ) : (
          <div className="space-y-2">
            {outgoing.map((req) => (
              <RequestRow key={req.friendship_id} req={req} onChange={onChange} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RequestRow({
  req,
  onChange,
}: {
  req: FriendshipEntry;
  onChange: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function action(path: string) {
    setPending(true);
    try {
      await authedRequest(path, { method: "POST" });
      onChange();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
      <p className="text-sm font-medium text-zinc-300">{req.other.username}</p>
      <div className="flex items-center gap-2 shrink-0">
        {req.direction === "incoming" ? (
          <>
            <button
              onClick={() => action(`/api/friends/${req.friendship_id}/accept`)}
              disabled={pending}
              className="px-3 py-1.5 bg-white text-black text-xs font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              Accept
            </button>
            <button
              onClick={() => action(`/api/friends/${req.friendship_id}/decline`)}
              disabled={pending}
              className="px-3 py-1.5 border border-zinc-700 text-zinc-400 text-xs font-semibold rounded-lg hover:border-white hover:text-white transition-colors disabled:opacity-50"
            >
              Decline
            </button>
          </>
        ) : (
          <button
            onClick={() => action(`/api/friends/${req.friendship_id}/decline`)}
            disabled={pending}
            className="px-3 py-1.5 border border-zinc-800 text-zinc-500 text-xs font-semibold rounded-lg hover:border-zinc-600 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function FindTab({
  onChange,
  outgoing,
}: {
  onChange: () => void;
  outgoing: FriendshipEntry[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMessage(null);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(() => {
      authedRequest<UserSearchResponse>(
        `/api/friends/search?q=${encodeURIComponent(query.trim())}`
      )
        .then((r) => {
          if (!cancelled) setResults(r.results);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const outgoingUsernames = new Set(outgoing.map((o) => o.other.username));

  async function sendRequest(username: string) {
    setMessage(null);
    try {
      await authedRequest("/api/friends/request", {
        method: "POST",
        body: JSON.stringify({ username }),
      });
      setMessage(`Friend request sent to ${username}.`);
      onChange();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.detail);
      } else {
        setMessage("Failed to send request.");
      }
    }
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search by username (min 2 characters)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-white"
      />
      {message && <p className="text-sm text-zinc-400">{message}</p>}
      {searching && results.length === 0 && (
        <p className="text-zinc-500 text-sm">Searching…</p>
      )}
      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-zinc-500 text-sm">No matches.</p>
      )}
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((user) => {
            const alreadySent = outgoingUsernames.has(user.username);
            return (
              <div
                key={user.user_id}
                className="bg-zinc-950 border border-zinc-900 rounded-xl px-5 py-4 flex items-center justify-between gap-4"
              >
                <p className="text-sm font-medium text-zinc-300">{user.username}</p>
                <button
                  onClick={() => sendRequest(user.username)}
                  disabled={alreadySent}
                  className="px-3 py-1.5 border border-zinc-700 text-white text-xs font-semibold rounded-lg hover:border-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {alreadySent ? "Pending" : "Add friend"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
