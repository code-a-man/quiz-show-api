import { Application } from "jsr:@oak/oak/application";
import { Router } from "jsr:@oak/oak/router";

import "@std/dotenv/load";
import questionsFile from "./questions.json" with { type: "json" };

const kv = await Deno.openKv(Deno.env.get("DENO_KV_URL"));

const router = new Router();

type Question = {
  id: number;
  questionText: string;
  options: string[];
  correctAnswer: string;
};

type Session = {
  uuid: string;
  selectedQ: number[];
  createdAt: number;
};

type Answer = {
  id: number;
  answer: string;
};

router.post("/bilisimekipyonetim/create-session", async (ctx) => {
  const uuid = crypto.randomUUID(); // UUID oluştur

  // Soruları JSON dosyasından oku
  const questions = [...questionsFile]
  const selectedQuestions = shuffle(questions).slice(0, 3).map((q: Question) => q.id);

  // Session'ı KV yerine bir object olarak sakla (ya da Deno KV'de tutabilirsin) I want unix timestamp
  const timestamp = Math.floor(new Date().getTime() / 1000);
  const session = { uuid, selectedQ: selectedQuestions, createdAt: timestamp };

  // Session'ı KV'ye kaydet
  await kv.set(["session", uuid], session, {expireIn: 300000} );

  // Bu session UUID'yi kullanıcıya dön
  ctx.response.body = { message: "Session oluşturuldu!", sessionUUID: uuid };
});

router.get("/session/:uuid", async (ctx) => {
  const { uuid } = ctx.params;

  const data = await kv.get(["session", uuid]);
  const session = data?.value as Session;
  if (!session) {
    ctx.response.status = 404;
    ctx.response.body = { message: "Session bulunamadı." };
    return;
  }

  // Kullanıcıya döneceğimiz sorular
  const questions = questionsFile.filter((q: Question) => session.selectedQ?.includes(q.id)).map((q: Question) => {
    return { id: q.id, questionText: q.questionText, options: q.options };
  });

  ctx.response.body = { questions };
  // request headers informations
  console.log(ctx.request.headers);
});

// submit answers and get score

router.post("/session/:uuid/submit", async (ctx) => {
  const { uuid } = ctx.params;
  const data = await kv.get(["session", uuid]);
  const session = data?.value as Session;
  if (!session) {
    ctx.response.status = 404;
    ctx.response.body = { message: "Session bulunamadı." };
    return;
  }

  /*
    [
      {id : 1, answer: "A"},
      {id : 2, answer: "1984"},
      {id : 3, answer: "Einstein"}
    ]
  */
  const answers = await ctx.request.body.json() as Answer[];

  if (typeof answers !== "object") {
    ctx.response.status = 400;
    ctx.response.body = { message: "Cevaplar bir obje olmalıdır." };
    return
  }

  if (!answers) {
    ctx.response.status = 400;
    ctx.response.body = { message: "Cevaplar boş olamaz." };
    return;
  }

  if (answers.length !== 3) {
    ctx.response.status = 400;
    ctx.response.body = { message: "3 soruya cevap vermelisiniz." };
    return;
  }

  const correctAnswers = questionsFile.filter((q: Question) => session.selectedQ?.includes(q.id)).map((q: Question) => {
    return { id: q.id, correctAnswer: q.correctAnswer };
  });

  let score = 0;

  answers.forEach((answer) => {
    const correctAnswer = correctAnswers.find((c) => c.id === answer.id);
    if (correctAnswer?.correctAnswer === answer.answer) {
      score++;
    }
  }
  );

  ctx.response.body = { score };

});



// deno-lint-ignore no-explicit-any
const shuffle = (array: Array<any>) => {
  let oldElement;
  for (let i = array.length - 1; i > 0; i--) {
    const rand = Math.floor(Math.random() * (i + 1));
    oldElement = array[i];
    array[i] = array[rand];
    array[rand] = oldElement;
  }
  return array;
} 


const app = new Application();

app.use(router.routes());
app.use(router.allowedMethods());

app.listen({ port: 8000 });
console.log("Server running on http://localhost:8000");
