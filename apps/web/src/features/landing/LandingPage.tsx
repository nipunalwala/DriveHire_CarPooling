import { Link } from 'react-router-dom';
import { MoveRight } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider.js';
import './landing.css';

const services = [
  {
    image: 'driver-hiring',
    title: 'Driver hiring',
    description: 'A qualified, approved driver for your own personal vehicle — on your terms.',
    href: '/drivers',
    action: 'Find a driver',
  },
  {
    image: 'shared-journey',
    title: 'Shared journeys',
    description: 'Instantly join a scheduled carpool — no host approval, just a seat.',
    href: '/carpools',
    action: 'Find a carpool',
  },
];

export function LandingPage() {
  const { user } = useAuth();
  return (
    <section className="landing-intro landing-page">
      <p className="landing-eyebrow">Driver hiring &amp; carpooling in India</p>
      <h1>
        Your journey.
        <br />A little more together.
      </h1>
      <p>
        Hire an approved driver for your own vehicle, or share a scheduled journey with a carpool.
        Start with an account, then choose your next step.
      </p>
      <Link
        className="button button-primary"
        to={
          user
            ? user.roles.includes('DRIVER')
              ? '/app/driver/dashboard'
              : '/app/dashboard'
            : '/register'
        }
      >
        {user ? 'Go to your dashboard' : 'Create your account'}
        <MoveRight size={17} aria-hidden="true" />
      </Link>
      <div className="service-summary">
        {services.map((service) => (
          <article key={service.image}>
            <img
              src={`/images/generated/${service.image}-768.webp`}
              srcSet={`/images/generated/${service.image}-384.webp 384w, /images/generated/${service.image}-768.webp 768w`}
              sizes="(max-width: 640px) calc(100vw - 40px), (max-width: 1100px) 45vw, 520px"
              width={768}
              height={512}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <h2>{service.title}</h2>
            <p>{service.description}</p>
            <Link to={service.href}>
              {service.action}
              <MoveRight size={16} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
      <p className="small-text illustration-disclosure">
        Illustrations show service concepts, not actual providers or listings.
      </p>
      <p className="small-text">Payment not collected by DriveHire.</p>
    </section>
  );
}
