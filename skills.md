# 🚀 SSC-Tasks Application Skills & Guidelines

Welcome to the **SSC-Tasks** professional development ecosystem. This document outlines the core competencies and architectural guidelines required for the AI Agent and developers to maintain the highest quality standards.

---

## 🛠 Core Technical Competencies

### 1. Mobile & Web Hybrid Development (Expo)
- **Framework**: Proficient in **Expo SDK 54** and **React Native**.
- **Navigation**: Expert usage of **Expo Router** for file-based routing and deep-linking.
- **Optimization**: Knowledge of Metro bundler configurations and efficient bridge communication.

### 2. Modern UI/UX (NativeWind & Tailwind)
- **Styling**: Implementation of **NativeWind** for cross-platform CSS-to-Native styling.
- **Design System**: Usage of `class-variance-authority` (CVA) to build consistent, theme-able component libraries.
- **Animation**: Leveraging `react-native-reanimated` and `tailwindcss-animate` for fluid micro-interactions.

### 3. Backend & Cloud Infrastructure (Firebase)
- **Firestore**: Advanced schema design for task management, including sub-collections and complex queries.
- **Authentication**: Implementing secure OIDC flows and role-based access control (RBAC).
- **Security**: Drafting and maintaining Firestore Security Rules to prevent unauthorized data access.

### 4. Logic & State Management
- **Hooks-First**: Utilization of custom React Hooks to encapsulate business logic.
- **Context API**: Managing global application state (Authentication, User Preferences) without excessive prop drilling.

---

## 🏗 Architectural Blueprint

| Layer | Responsibility | Technology |
| :--- | :--- | :--- |
| **View** | UI Rendering & User Experience | React Native / NativeWind |
| **Logic** | Business Rules & Data Flow | Custom Hooks / Context |
| **Data** | Persistent Storage & Auth | Firebase v12 |
| **Routing** | Navigation & Page Hierarchy | Expo Router |

---

## ✍️ Coding Manifest
- **Professionalism**: Write code that is self-documenting and follows the "Clean Code" principles.
- **Scalability**: Design components and functions that can handle growth in users and complexity.
- **Reliability**: Ensure edge cases (offline mode, slow networks) are handled gracefully using Firebase's persistence layer.

---

> [!TIP]
> **Priority Check**: For the AI Agent, always prioritize the `(admin)` and `(member)` folder isolation to ensure role-based logic remains clean and uncoupled.

---
*Created by Antigravity for SSC-Tasks | 2026*
