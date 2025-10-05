// Mobile Navigation Toggle
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  navMenu.classList.toggle('active');
});

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-menu a').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navMenu.classList.remove('active');
  });
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', function (e) {
    e.preventDefault();

    const targetId = this.getAttribute('href');
    const targetSection = document.querySelector(targetId);

    if (targetSection) {
      const offsetTop = targetSection.offsetTop - 80; // Account for fixed navbar

      window.scrollTo({
        top: offsetTop,
        behavior: 'smooth',
      });
    }
  });
});

// Navbar background on scroll
window.addEventListener('scroll', () => {
  const navbar = document.querySelector('.navbar');

  if (window.scrollY > 100) {
    navbar.style.background = 'rgba(255, 255, 255, 0.98)';
    navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
  } else {
    navbar.style.background = 'rgba(255, 255, 255, 0.95)';
    navbar.style.boxShadow = 'none';
  }
});

// Animate elements on scroll
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px',
};

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

// Observe sections for animation
document.querySelectorAll('section').forEach(section => {
  section.style.opacity = '0';
  section.style.transform = 'translateY(30px)';
  section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  observer.observe(section);
});

// Hero buttons functionality
document.querySelector('.btn-primary').addEventListener('click', () => {
  // Scroll to contact section
  document.querySelector('#contact').scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
});

document.querySelector('.btn-secondary').addEventListener('click', () => {
  // Scroll to portfolio section
  document.querySelector('#portfolio').scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
});

// Contact form handling
const contactForm = document.querySelector('.contact-form');

contactForm.addEventListener('submit', e => {
  e.preventDefault();

  // Get form data
  const formData = new FormData(contactForm);
  const name = contactForm.querySelector('input[type="text"]').value;
  const email = contactForm.querySelector('input[type="email"]').value;
  const subject = contactForm.querySelectorAll('input[type="text"]')[1].value;
  const message = contactForm.querySelector('textarea').value;

  // Simple validation
  if (!name || !email || !subject || !message) {
    alert('Please fill in all fields.');
    return;
  }

  // Simulate form submission
  const submitBtn = contactForm.querySelector('.btn-primary');
  const originalText = submitBtn.textContent;

  submitBtn.textContent = 'Sending...';
  submitBtn.disabled = true;

  setTimeout(() => {
    alert("Thank you for your message! I'll get back to you soon.");
    contactForm.reset();
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }, 2000);
});

// Add parallax effect to hero
window.addEventListener('scroll', () => {
  const scrolled = window.pageYOffset;
  const parallaxElements = document.querySelectorAll('.floating-card');

  parallaxElements.forEach((element, index) => {
    const speed = 0.1 + index * 0.05;
    const yPos = scrolled * speed;
    element.style.transform = `translateY(${yPos}px)`;
  });
});

// Add typing effect to hero title
const typingElement = document.querySelector('.hero-title');
const originalText = typingElement.innerHTML;
const textToType = 'Creative Design';

// Clear the title
typingElement.innerHTML = '';

// Typing animation
let charIndex = 0;
const typeText = () => {
  if (charIndex < textToType.length) {
    typingElement.innerHTML += textToType.charAt(charIndex);
    charIndex++;
    setTimeout(typeText, 100);
  }
};

// Start typing effect after page load
window.addEventListener('load', () => {
  setTimeout(typeText, 500);
});

// Service cards hover effect
document.querySelectorAll('.service-card').forEach(card => {
  card.addEventListener('mouseenter', () => {
    card.style.transform = 'translateY(-10px) scale(1.02)';
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = 'translateY(0) scale(1)';
  });
});

// Portfolio items click handler
document.querySelectorAll('.portfolio-item').forEach(item => {
  item.addEventListener('click', () => {
    const title = item.querySelector('h4').textContent;
    alert(
      `You clicked on: ${title}\n\nThis would typically open a detailed view or live demo of the project.`
    );
  });
});

// Counter animation for stats
const animateCounters = () => {
  const counters = document.querySelectorAll('.stat h4');

  counters.forEach(counter => {
    const target = parseInt(counter.textContent);
    const increment = target / 100;
    let current = 0;

    const updateCounter = () => {
      if (current < target) {
        current += increment;
        counter.textContent = Math.floor(current) + '+';
        requestAnimationFrame(updateCounter);
      } else {
        counter.textContent = target + '+';
      }
    };

    updateCounter();
  });
};

// Trigger counter animation when about section is in view
const aboutSection = document.querySelector('#about');
const aboutObserver = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounters();
        aboutObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.5 }
);

aboutObserver.observe(aboutSection);

// Add gradient text effect to section headers
document.querySelectorAll('.section-header h2').forEach(header => {
  header.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  header.style.webkitBackgroundClip = 'text';
  header.style.webkitTextFillColor = 'transparent';
  header.style.backgroundClip = 'text';
});

// Page load animation
window.addEventListener('load', () => {
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.5s ease';

  setTimeout(() => {
    document.body.style.opacity = '1';
  }, 100);
});
