# Expense Management System

**Student:** Weihao Song  
**Student ID:** 25645060

## 1. Project Summary

Expense Management System is a React-based single-page web application that extends the original Assignment 1 Expense Tracker into a more complex multi-user expense management platform. The website helps users record, manage, search, and analyse personal expenses. It also includes user registration/login, JWT authentication, password hashing, activity tracking, and an admin panel for managing users and viewing system activity.

This project is designed to satisfy the Assignment 2 requirement of using a modern frontend library with an appropriate backend and database. It includes three main database entities that support CRUD-related operations: `users`, `expense_items`, and `user_activities`.

## 2. Technical Stack

- **Frontend Library:** React with Vite
- **Frontend Styling:** CSS
- **Backend:** Node.js and Express
- **Database:** MySQL
- **Authentication:** bcryptjs password hashing and JSON Web Token (JWT)
- **Data Exchange:** REST-style JSON API
- **Routing / Navigation:** React state-based single-page navigation and Express API routes
- **Deployment:** Local development setup

## 3. Main Features

### User Authentication
- User registration
- User login
- Password hashing using bcryptjs
- JWT-based session authentication
- Logout activity tracking

### Expense Management
- Create expense records
- Read expense records from MySQL
- Update expense records
- Delete expense records
- Live search by title, category, description, or owner name
- Filter by category
- Category summary
- Monthly trend summary
- Total spending and record count dashboard

### User Activity Tracking
- Records user registration
- Records login and logout
- Records expense creation, update, and deletion
- Users can view their own activity history
- Admin can view all system activities

### Admin Features
- View all users
- Create users
- Update user name, role, and account status
- Delete users
- View all expenses
- View all activities

## 4. Folder Structure

```text
expense-management-system/
├── client/
│   ├── src/
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── .env.example
│   ├── index.html
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── db.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
│
├── database.sql
├── package.json
├── README.md
└── .gitignore
```

## 5. Database Design

The project uses three main entities:

### users
Stores registered users and admin accounts.

Important fields:
- `id`
- `name`
- `email`
- `password_hash`
- `role`
- `status`
- `created_at`

### expense_items
Stores expense records. Each expense belongs to a user through `user_id`.

Important fields:
- `id`
- `user_id`
- `title`
- `category`
- `amount`
- `expense_date`
- `description`
- `created_at`

### user_activities
Stores user activity logs, such as login, logout, and CRUD operations.

Important fields:
- `id`
- `user_id`
- `action`
- `entity_type`
- `entity_id`
- `description`
- `created_at`

## 6. How to Run the Project

### Step 1: Create the Database

Open MySQL Workbench and run the `database.sql` file.

This will create:

- database: `expense_management_system`
- table: `users`
- table: `expense_items`
- table: `user_activities`


### Step 2: Install Dependencies

From the project root folder, run:

```bash
npm install
npm run install-all
```

Alternatively, install dependencies separately:

```bash
cd server
npm install

cd ../client
npm install
```

### Step 3: Start the Project

From the project root folder, run:

```bash
npm run dev
```

Or run backend and frontend separately:

```bash
cd server
npm run dev
```

Open another terminal:

```bash
cd client
npm run dev
```

### Step 4: Open the Website

Open the frontend URL in a browser:

```text
http://localhost:5173
```

The backend API runs at:

```text
http://localhost:4000/api
```

## 5. Demo Account

After the backend starts for the first time, it creates an admin account based on `server/.env`:

```text
Email: admin@example.com
Password: Admin123!
```

You can also register normal users from the registration page.