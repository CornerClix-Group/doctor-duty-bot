import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';

const Auth = () => {
  const navigate = useNavigate();
  const [isAnimating, setIsAnimating] = useState(false);

  const handleGetStarted = () => {
    setIsAnimating(true);
    setTimeout(() => {
      navigate('/');
    }, 600);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-black to-black" />
      
      {/* Animated Orb */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-primary/30 rounded-full blur-[120px] animate-pulse" />
      
      {/* Content */}
      <div className={`relative z-10 flex flex-col items-center space-y-12 transition-all duration-600 ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        {/* Logo/Icon */}
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl" />
          <div className="relative bg-gradient-to-br from-primary to-secondary p-6 rounded-3xl shadow-2xl">
            <Calendar className="w-16 h-16 text-white" />
          </div>
        </div>

        {/* Brand Name */}
        <div className="text-center space-y-3">
          <h1 className="text-7xl font-bold text-white tracking-tight">
            ShiftPro
          </h1>
          <p className="text-xl text-gray-400 font-light">
            Intelligent Physician Scheduling
          </p>
        </div>

        {/* Main Message */}
        <div className="text-center space-y-2 max-w-md">
          <h2 className="text-2xl font-semibold text-white">
            Welcome to ShiftPro
          </h2>
          <p className="text-base text-gray-400 leading-relaxed">
            Starting today, let&apos;s optimize schedules and streamline your workforce management.
          </p>
        </div>

        {/* CTA Button */}
        <Button
          onClick={handleGetStarted}
          size="lg"
          className="w-full max-w-sm h-14 text-lg font-semibold bg-white text-black hover:bg-gray-100 rounded-full shadow-lg transition-all hover:scale-105"
        >
          Get Started
        </Button>

        {/* Bottom Text */}
        <p className="text-sm text-gray-500 mt-8">
          AI-powered scheduling for modern healthcare
        </p>
      </div>

      {/* Bottom Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />
    </div>
  );
};

export default Auth;
