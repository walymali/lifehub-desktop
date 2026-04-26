# ArabLand Pro - Premium Landing Page Templates

**3 Premium HTML Landing Page Templates with Full Arabic/RTL Support**

The first landing page template bundle designed Arabic-first. Each template comes in English (LTR) and Arabic (RTL) versions, fully responsive, and built with pure HTML/CSS/JS - zero dependencies.

---

## What's Included

| Template | Description | Sections |
|----------|-------------|----------|
| **SaaS / Startup** | Modern gradient design for tech products | Hero, Features, How It Works, Pricing, Testimonials, FAQ, CTA, Footer |
| **Agency / Portfolio** | Dark, bold design for creative agencies | Hero, Services, Portfolio Grid, About + Stats, Team, Contact Form, Footer |
| **Restaurant / Food** | Elegant warm design for fine dining | Hero, About, Menu, Gallery, Reviews, Reservation CTA, Footer |

**Total: 6 HTML pages** (3 English + 3 Arabic)

---

## Features

- **Full Arabic/RTL Support** - Native RTL layouts, Arabic typography (Tajawal font), properly mirrored UI
- **Fully Responsive** - Optimized for Desktop, Tablet, and Mobile
- **CSS Variables** - Change colors, fonts, and spacing in seconds
- **Smooth Animations** - Scroll-triggered fade-in animations using IntersectionObserver
- **Mobile Navigation** - Animated hamburger menu with slide-in panel
- **FAQ Accordion** - Expandable FAQ sections (SaaS template)
- **Sticky Header** - Header changes style on scroll
- **SEO-Friendly** - Semantic HTML5, proper meta tags, clean markup
- **Fast Loading** - No frameworks, no dependencies, under 100KB per page
- **Google Fonts** - Inter (English) + Tajawal (Arabic)

---

## Quick Start

1. Unzip the package
2. Open any `index.html` file in your browser
3. Open `preview.html` to see all templates at once

### Customizing Colors

Each template uses CSS variables. Open the `style.css` file in the template folder and change these values:

```css
:root {
  --color-primary: #4F46E5;      /* Main brand color */
  --color-primary-dark: #4338CA;  /* Hover states */
  --color-heading: #111827;       /* Heading text */
  --color-text: #4B5563;          /* Body text */
}
```

### Customizing Fonts

Change the Google Fonts import in the HTML `<head>` and update these variables in `shared/css/utilities.css`:

```css
:root {
  --font-en: 'Inter', system-ui, sans-serif;
  --font-ar: 'Tajawal', system-ui, sans-serif;
}
```

### Adding Your Images

Replace placeholder text (e.g., "Your Product Screenshot", "Food Photo 1") with `<img>` tags pointing to your images.

---

## File Structure

```
arabland-pro/
├── preview.html              ← Preview all templates
├── README.md                 ← This file
├── shared/
│   ├── css/
│   │   ├── reset.css         ← CSS reset
│   │   └── utilities.css     ← Shared components
│   ├── js/
│   │   └── main.js           ← Shared JavaScript
│   └── images/
│       └── placeholder/
├── saas-startup/
│   ├── index.html            ← English version
│   ├── index-ar.html         ← Arabic/RTL version
│   └── style.css
├── agency-portfolio/
│   ├── index.html
│   ├── index-ar.html
│   └── style.css
└── restaurant/
    ├── index.html
    ├── index-ar.html
    └── style.css
```

---

## Browser Support

- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

---

## License

- **Regular License**: Use in a single end product (personal or client project)
- **Extended License**: Use in unlimited end products, including SaaS and commercial applications

---

## Support

For questions or customization requests, contact us at your-email@example.com

Made with care for the Arabic web community.
