import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, HandOffIfSignedIn, RequireAuth, RequireSetup } from './lib/auth';
import { captureAttribution } from './lib/attribution';
import { SiteLayout } from './components/layout/SiteLayout';
import { CookieBanner } from './components/CookieBanner';
import { RouteAnnouncer } from './components/RouteAnnouncer';
import { AppRedirect } from './pages/AppRedirect';
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
import { FinishSetup } from './pages/auth/FinishSetup';
import { CheckoutSuccess } from './pages/checkout/CheckoutSuccess';
import { CheckoutCancelled } from './pages/checkout/CheckoutCancelled';

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
        <RouteAnnouncer />
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
          {/*
            Somebody who is already signed in is not shown a login form; they are sent
            where they were going. See HandOffIfSignedIn in lib/auth.tsx.

            /sign-up is deliberately NOT wrapped the same way. "Log in" while logged in has
            one sensible meaning and no other; "make a label free" does not, and a maker
            who wants a second account under a different email must be able to reach the
            form to sign out of the first one.
          */}
          <Route
            path="/log-in"
            element={
            <HandOffIfSignedIn>
                <LogIn />
              </HandOffIfSignedIn>
            } />

          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/check-your-email" element={<CheckEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/*
            Where Google returns everybody, signup and login alike, because an OAuth call
            cannot carry a business name or a Terms acceptance and this is the first point
            at which we can tell the two apart. A new user gets the form; a returning one
            is handed straight to the app without touching anything.
          */}
          <Route
            path="/finish-setup"
            element={
            <RequireAuth>
                <RequireSetup>
                  <FinishSetup />
                </RequireSetup>
              </RequireAuth>
            } />


          {/*
            THE WWW DASHBOARD IS GONE, AND THESE TWO ROUTES ARE ITS FORWARDING ADDRESS.

            www is marketing and auth. app.batchlabel.xyz owns account management, and it
            covers everything this site's account page used to: the email address, the
            password, the marketing email consent, the plan, the Stripe portal and the
            data-rights requests — several of them properly, where www could only print an
            address to write to. Keeping a second place to manage an account is what
            produced the complaint this change answers.

            Not gated on a session, on purpose. Somebody signed out following an old
            bookmark is better served by the app's own gate, which sends them to /log-in
            with `next` set and therefore brings them back to where they were aiming.
          */}
          <Route path="/dashboard" element={<AppRedirect />} />
          <Route path="/dashboard/account" element={<AppRedirect to="/settings/account" />} />
        </Routes>
        <CookieBanner />
      </AuthProvider>
    </BrowserRouter>);

}