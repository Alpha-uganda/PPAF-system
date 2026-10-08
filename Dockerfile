FROM node:20-alpine
WORKDIR /app
COPY package.json server.js Partner_Poultry_and_Animal_Feeds_Admin_LINKED.html index(1)_LINKED.html START_PPAF.txt ./
ENV PORT=8099
ENV HOST=0.0.0.0
EXPOSE 8099
CMD ["node", "server.js"]
