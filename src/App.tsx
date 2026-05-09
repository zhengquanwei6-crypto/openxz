import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./components/ui/Toast";
import { AppLayout } from "./components/layout/AppLayout";

// Code-split all pages for smaller initial bundle
const DiscoverPage = lazy(() => import("./pages/Discover").then(m => ({ default: m.DiscoverPage })));
const ChatListPage = lazy(() => import("./pages/ChatList").then(m => ({ default: m.ChatListPage })));
const ChatPage = lazy(() => import("./pages/Chat").then(m => ({ default: m.ChatPage })));
const SettingsPage = lazy(() => import("./pages/Settings").then(m => ({ default: m.SettingsPage })));
const LoginPage = lazy(() => import("./pages/Login").then(m => ({ default: m.LoginPage })));
const CharacterDetailPage = lazy(() => import("./pages/CharacterDetail").then(m => ({ default: m.CharacterDetailPage })));
const MemoriesPage = lazy(() => import("./pages/Memories").then(m => ({ default: m.MemoriesPage })));
const PersonaEditorPage = lazy(() => import("./pages/PersonaEditor").then(m => ({ default: m.PersonaEditorPage })));
const RelationshipStatusPage = lazy(() => import("./pages/RelationshipStatus").then(m => ({ default: m.RelationshipStatusPage })));
const SubscriptionPage = lazy(() => import("./pages/Subscription").then(m => ({ default: m.SubscriptionPage })));
const PrivacyPage = lazy(() => import("./pages/Privacy").then(m => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("./pages/Privacy").then(m => ({ default: m.TermsPage })));
const CheckInPage = lazy(() => import("./pages/CheckIn").then(m => ({ default: m.CheckInPage })));
const SharePage = lazy(() => import("./pages/Share").then(m => ({ default: m.SharePage })));
const AchievementsPage = lazy(() => import("./pages/Achievements").then(m => ({ default: m.AchievementsPage })));
const SearchPage = lazy(() => import("./pages/Search").then(m => ({ default: m.SearchPage })));

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/discover" replace />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/chats" element={<ChatListPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/chat/:conversationId" element={<ChatPage />} />
          <Route path="/character/:characterId" element={<CharacterDetailPage />} />
          <Route path="/memories" element={<MemoriesPage />} />
          <Route path="/persona" element={<PersonaEditorPage />} />
          <Route path="/relationship/:characterId" element={<RelationshipStatusPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/subscription" element={<SubscriptionPage />} />
          <Route path="/check-in" element={<CheckInPage />} />
          <Route path="/share/:characterId" element={<SharePage />} />
          <Route path="/achievements" element={<AchievementsPage />} />
          <Route path="/search" element={<SearchPage />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
