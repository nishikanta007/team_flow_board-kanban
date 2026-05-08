Team Flow Board (Kanflow)

A full-stack collaborative Kanban board application designed to manage tasks, organize workflows, and enable real-time team collaboration.

Overview

Team Flow Board is a modern task management application that allows users to create boards, manage tasks across multiple stages, and collaborate efficiently. The application is built with a focus on usability, performance, and a clean interface.

Features
User authentication (Sign up / Login)
Create and manage boards
Create lists for task organization
Add, edit, and delete tasks
Drag-and-drop task management
Real-time data synchronization
Responsive user interface
Tech Stack

Frontend

React (Vite)
TypeScript
Tailwind CSS
TanStack Router
React Query
@hello-pangea/dnd

Backend / Services

Supabase (PostgreSQL, Authentication, Realtime)
Setup Instructions
Clone the repository
git clone https://github.com/nishikanta007/team_flow_board-kanban.git
cd team-flow-board
Install dependencies
npm install
Configure environment variables

Create a .env file in the root directory:

VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

Run the application
npm run dev

*Notes*
The application uses Supabase for backend services including authentication and database management.
Environment variables are required for proper backend connectivity.
The project focuses on core functionality and maintainable architecture.

*Conclusion*

This project demonstrates the development of a full-stack application with real-time capabilities, clean UI design, and structured state management using modern technologies.
