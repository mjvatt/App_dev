from datetime import datetime

from pydantic import BaseModel


class FriendshipRequestBody(BaseModel):
    username: str


class FriendUserSummary(BaseModel):
    user_id: str
    username: str
    level: int
    total_xp: int
    streak_days: int


class FriendshipEntry(BaseModel):
    """A row representing a connection from the perspective of the
    requester. friendship_id is the row id (used for accept/decline).
    other is the user on the other side of the relationship."""
    friendship_id: str
    status: str  # 'pending' | 'accepted'
    direction: str  # 'incoming' | 'outgoing' | 'mutual'
    other: FriendUserSummary
    created_at: datetime


class FriendsListResponse(BaseModel):
    friends: list[FriendshipEntry]


class FriendRequestsResponse(BaseModel):
    incoming: list[FriendshipEntry]
    outgoing: list[FriendshipEntry]


class UserSearchEntry(BaseModel):
    user_id: str
    username: str


class UserSearchResponse(BaseModel):
    results: list[UserSearchEntry]


class FriendLeaderboardEntry(BaseModel):
    rank: int
    username: str
    level: int
    total_xp: int
    streak_days: int
    is_current_user: bool


class FriendLeaderboardResponse(BaseModel):
    entries: list[FriendLeaderboardEntry]
