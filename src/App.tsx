import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import { DiscoverPage } from "./pages/Discover";
import { ChatListPage } from "./pages/ChatList";
import { ChatPage } from "./pages/Chat";
import { SettingsPage } from "./pages/Settings";
import { LoginPage } from "./pages/Login";
import { CharacterDetailPage } from "./pages/CharacterDetail";
import { MemoriesPage } from "./pages/Memories";
import { PersonaEditorPage } from "./pages/PersonaEditor";
import { RelationshipStatusPage } from "./pages/RelationshipStatus";
import { PrivacyPage, TermsPage } from "./pages/Privacy";
import { SubscriptionPage } from "./pages/Subscription";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
