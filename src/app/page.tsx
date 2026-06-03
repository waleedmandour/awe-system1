'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppStore, type Assessment } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';

// Layout components
import InstallBanner from '@/components/layout/InstallBanner';
import OfflineIndicator from '@/components/layout/OfflineIndicator';
import BottomNav from '@/components/layout/BottomNav';

// Screen components
import AuthScreen from '@/components/screens/AuthScreen';
import WelcomeScreen from '@/components/screens/WelcomeScreen';
import CourseSelectionScreen from '@/components/screens/CourseSelectionScreen';
import UploadScreen from '@/components/screens/UploadScreen';
import ProcessingScreen from '@/components/screens/ProcessingScreen';
import ReviewScreen from '@/components/screens/ReviewScreen';
import AssessmentScreen from '@/components/screens/AssessmentScreen';
import ResultsScreen from '@/components/screens/ResultsScreen';
import RecordsScreen from '@/components/screens/RecordsScreen';

// ─── Main App Component (Orchestrator) ─────────────────────────────────────────
// Teacher deployment: API key is server-side (env var GEMINI_API_KEY)
// Email whitelist authentication protects paid API access.

export default function AWEApp() {
  const {
    currentStep,
    setStep,
    selectedCourse,
    extractedText,
    setExtractedText,
    currentAssessment,
    setCurrentAssessment,
    resetAssessment,
    setProcessing,
    authenticatedEmail,
    setAuthenticatedEmail,
    isAuthChecked,
    setAuthChecked,
  } = useAppStore();

  const { toast } = useToast();

  const [direction, setDirection] = useState<'left' | 'right'>('right');

  // ─── Check authentication on app load ─────────────────────────────────────
  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch('/api/auth');
        const data = await response.json();

        if (data.authenticated && data.email) {
          setAuthenticatedEmail(data.email);
          setStep('welcome');
        } else {
          setAuthenticatedEmail(null);
          setStep('auth');
        }
      } catch {
        // Network error — default to auth screen
        setStep('auth');
      } finally {
        setAuthChecked(true);
      }
    }

    checkAuth();
  }, []);

  const navigateTo = (step: string) => {
    setDirection('right');
    setStep(step as any);
  };

  const goBack = () => {
    setDirection('left');
    const stepOrder = ['auth', 'welcome', 'course', 'upload', 'processing', 'review', 'assessing', 'results', 'records'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setStep(stepOrder[currentIndex - 1] as any);
    }
  };

  // Handle successful authentication
  const handleAuthenticated = (email: string) => {
    setAuthenticatedEmail(email);
    setStep('welcome');
  };

  // Handle image upload and OCR processing — supports single or multi-page (up to 2)
  const handleImageUpload = async (images: string[]) => {
    setStep('processing');
    const pageCount = images.length;
    setProcessing(true, `Extracting text from ${pageCount} page${pageCount > 1 ? 's' : ''}...`);

    try {
      // Call the OCR API endpoint with array of images (processed in order)
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images, // Array of base64/data-uri image strings, in page order
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to process image');
      }

      // Use the actual extracted text from the API (already combined in page order)
      const extractedText = result.text || '';

      if (!extractedText.trim()) {
        toast({
          title: 'No Text Found',
          description: 'Could not extract any text from the image. Please try a clearer image.',
          variant: 'destructive',
        });
        setProcessing(false);
        setStep('upload');
        return;
      }

      setExtractedText(extractedText);
      setProcessing(false);
      // Record OCR completion time for cooldown timer
      useAppStore.getState().setOcrCompletedAt(Date.now());
      setStep('review');
    } catch (error) {
      console.error('OCR processing error:', error);
      setProcessing(false);
      toast({
        title: 'OCR Failed',
        description: error instanceof Error ? error.message : 'Failed to extract text from image.',
        variant: 'destructive',
      });
      setStep('upload');
    }
  };

  // Handle assessment submission
  const handleSubmitEssay = async (text: string) => {
    setStep('assessing');
    // Assessment will be handled by AssessmentScreen
  };

  // Handle assessment completion — wrapped in useCallback for stable reference
  const handleAssessmentComplete = useCallback((assessment: Assessment) => {
    setCurrentAssessment(assessment);
    // Auto-save record
    const { selectedCourse, extractedText, addRecord } = useAppStore.getState();
    addRecord({
      id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      assessment,
      course: selectedCourse,
      essayText: extractedText,
      createdAt: new Date().toISOString(),
    });
    setStep('results');
  }, []);

  // Handle new assessment
  const handleNewAssessment = () => {
    resetAssessment();
    setStep('welcome');
  };

  // ─── Show loading state while checking auth ────────────────────────────────
  if (!isAuthChecked) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-[#0c1d3a] via-[#1e40af] to-[#0c1d3a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-white/95 shadow-xl overflow-hidden p-1.5">
            <img
              src="/iawe-icon.png"
              alt="iAWE System"
              className="w-full h-full object-contain"
              draggable={false}
            />
          </div>
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Loading iAWE System...</p>
        </div>
      </div>
    );
  }

  // ─── Step-based routing ────────────────────────────────────────────────────

  const renderScreen = () => {
    switch (currentStep) {
      case 'auth':
        return (
          <AuthScreen
            onAuthenticated={handleAuthenticated}
            initialEmail={authenticatedEmail || undefined}
          />
        );
      case 'welcome':
        return (
          <WelcomeScreen
            onGetStarted={() => navigateTo('course')}
          />
        );
      case 'course':
        return (
          <CourseSelectionScreen
            onSelect={() => navigateTo('upload')}
            onBack={goBack}
          />
        );
      case 'upload':
        return (
          <UploadScreen
            onUpload={handleImageUpload}
            onBack={goBack}
          />
        );
      case 'processing':
        return (
          <ProcessingScreen />
        );
      case 'review':
        return (
          <ReviewScreen
            onSubmit={handleSubmitEssay}
            onBack={goBack}
          />
        );
      case 'assessing':
        return (
          <AssessmentScreen
            onComplete={handleAssessmentComplete}
          />
        );
      case 'results':
        return (
          <ResultsScreen
            assessment={currentAssessment!}
            onNewAssessment={handleNewAssessment}
            onBack={goBack}
          />
        );
      case 'records':
        return (
          <RecordsScreen
            onBack={goBack}
            onNewAssessment={handleNewAssessment}
          />
        );
      default:
        return <AuthScreen onAuthenticated={handleAuthenticated} />;
    }
  };

  // ─── BottomNav visibility ───────────────────────────────────────────────────

  const shouldShowBottomNav = !['auth', 'processing', 'assessing'].includes(currentStep);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mobile-container bg-background">
      <OfflineIndicator />
      <InstallBanner />

      <AnimatePresence mode="wait" custom={direction}>
        {renderScreen()}
      </AnimatePresence>

      {shouldShowBottomNav && currentStep !== 'welcome' && (
        <BottomNav currentStep={currentStep} onNavigate={navigateTo} />
      )}

      {/* Footer Credits */}
      <footer className="text-center py-3 text-xs text-muted-foreground border-t bg-white/80 backdrop-blur-sm">
        <p>Developed by: <span className="font-medium text-[#1e40af]">Dr. Waleed Mandour</span></p>
        <p>AI Co-Marker Assistance Project, 2026</p>
        <p className="mt-1 text-[10px] text-amber-600">AI may make mistakes. Verify results with a qualified instructor.</p>
      </footer>
    </div>
  );
}
