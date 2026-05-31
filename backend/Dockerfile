FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3002
CMD ["sh", "-c", "echo 'CMD started' && npx prisma migrate deploy && echo 'Migration done' && echo 'dist contents:' && ls dist/ && echo 'PORT='$PORT && node dist/server.js; echo 'Node exited with code' $?"]
