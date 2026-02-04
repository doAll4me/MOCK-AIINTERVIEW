import { Observable } from 'rxjs';

// 创建一个Observable
const observable = new Observable((subscriber) => {
  console.log('Observable被订阅了');

  subscriber.next(1); //发送数据1
  subscriber.next(2); //发送数据2
  subscriber.next(3); //发送数据3

  subscriber.complete(); //标记完成
});

// 订阅这个Observable
// Observable只有被订阅的时候才执行。这叫"懒执行"。
observable.subscribe({
  next: (value) => {
    console.log('收到数据:', value);
  },
  error: (error) => {
    console.error('出错了:', error);
  },
  complete: () => {
    console.log('所有数据都收到了，完毕');
  },
});
