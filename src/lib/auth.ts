import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "./mongodb";
import { User } from "../models/User";
import { Role } from "../models/Role";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Tên đăng nhập", type: "text" },
        password: { label: "Mật khẩu", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        try {
          await connectDB();
          const user = await User.findOne({
            username: credentials.username as string,
          });

          if (!user) return null;

          const isValid = await bcrypt.compare(
            credentials.password as string,
            user.password
          );

          if (!isValid) return null;

          // Fetch role permissions
          const roleData = await Role.findOne({ key: user.role });

          // Update last login
          await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });

          return {
            id: user._id.toString(),
            name: user.fullname,
            email: user.username,
            role: user.role,
            fullname: user.fullname,
            cars: user.cars || [],
            viewUnpaid: roleData ? !!roleData.viewUnpaid : false,
            viewPaid: roleData ? !!roleData.viewPaid : false,
            viewRevenueOverview: roleData ? !!roleData.viewRevenueOverview : false,
            canDeleteLocal: roleData ? !!roleData.canDeleteLocal : false,
            isDriverRole: roleData ? !!roleData.isDriverRole : false,
          };
        } catch (error) {
          console.error("Auth error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.username = user.email;
        token.fullname = (user as any).fullname;
        token.cars = (user as any).cars;
        token.viewUnpaid = (user as any).viewUnpaid;
        token.viewPaid = (user as any).viewPaid;
        token.viewRevenueOverview = (user as any).viewRevenueOverview;
        token.canDeleteLocal = (user as any).canDeleteLocal;
        token.isDriverRole = (user as any).isDriverRole;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).username = token.username;
        (session.user as any).fullname = token.fullname;
        (session.user as any).cars = token.cars;
        (session.user as any).viewUnpaid = token.viewUnpaid;
        (session.user as any).viewPaid = token.viewPaid;
        (session.user as any).viewRevenueOverview = token.viewRevenueOverview;
        (session.user as any).canDeleteLocal = token.canDeleteLocal;
        (session.user as any).isDriverRole = token.isDriverRole;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Cho phép URL tương đối
      if (url.startsWith("/")) return `${baseUrl}${url}`;

      // Cho phép URL tuyệt đối cùng origin (NextAuth v4 mặc định baseUrl là NEXTAUTH_URL)
      try {
        const urlObj = new URL(url);
        const baseObj = new URL(baseUrl);
        if (urlObj.origin === baseObj.origin) return url;
      } catch (e) {}

      return baseUrl;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
