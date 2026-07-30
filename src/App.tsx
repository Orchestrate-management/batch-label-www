import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './lib/auth';
import { captureAttribution } from './lib/attribution';
import { SiteLayout } from './components/layout/SiteLayout';
import { CookieBanner } from './components/CookieBanner';
import { DashboardLayout } from './components/dashboard/DashboardLayout';
import { Home } from './pages/Home';
import { Pricing } from './pages/Pricing';
import { HowItWorks } from './pages/HowItWorks';
import { Faq } from './pages/Faq';
import { About } from './pages/About';
import { Contact } from './pages/Contact';
import { NotFound } from './pages/NotFound';
import { Terms } from './pages/legal/Terms';
import { Privacy } from './pages/legal/Privacy';
import { CookiePolicy } from './pages/legal/CookiePolicy';
import { AcceptableUse } from './pages/legal/AcceptableUse';
import { SignUp } from './pages/auth/SignUp';
import { LogIn } from './pages/auth/LogIn';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { CheckEmail } from './pages/auth/CheckEmail';
import { ResetPassword } from './pages/auth/ResetPassword';
import { CheckoutSuccess } from './pages/checkout/CheckoutSuccess';
import { CheckoutCancelled } from './pages/checkout/CheckoutCancelled';
import { Labels } from './pages/dashboard/Labels';
import { Account } from './pages/dashboard/Account';

/** First touch attribution is captured once, before anything else can overwrite it. */
function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AttributionCapture />
        <ScrollToTop />
        <Routes>
          <Route element={<SiteLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/cookie-policy" element={<CookiePolicy />} />
            <Route path="/acceptable-use" element={<AcceptableUse />} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/cancelled" element={<CheckoutCancelled />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route path="/sign-up" element={<SignUp />} />
          <Route path="/log-in" element={<LogIn />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/check-your-email" element={<CheckEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route
            path="/dashboard"
            element={
            <RequireAuth>
                <DashboardLayout />
              </RequireAuth>
            }>
            
            <Route index element={<Labels />} />
            <Route path="account" element={<Account />} />
          </Route>
        </Routes>
        <CookieBanner />
      </AuthProvider>
    </BrowserRouter>);

}