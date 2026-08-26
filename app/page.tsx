'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { db, auth } from './firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';
import { useSearchParams } from 'next/navigation';

function MainApp() {
  const searchParams = useSearchParams();
  const restaurantParam = searchParams.get('restaurant');

  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'admin' | 'owner' | 'customer'>(restaurantParam ? 'customer' : 'customer');
  
  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [restaurantNameInput, setRestaurantNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // App Data
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>(restaurantParam || '');
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [currentRestaurantData, setCurrentRestaurantData] = useState<any>(null);
  
  // Admin form
  const [newRestaurantName, setNewRestaurantName] = useState('');
  const [ownerEmailForRes, setOwnerEmailForRes] = useState('');
  
  // Dishes & Orders
  const [dishes, setDishes] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [tableNumber, setTableNumber] = useState('');
  const [orders, setOrders] = useState<any[]>([]);

  // Dish Form & Editing State
  const [editingDishId, setEditingDishId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('أطباق رئيسية');
  const [imageFile, setImageFile] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);

  // Custom Categories for Restaurant
  const [customCategories, setCustomCategories] = useState<string[]>(['أطباق رئيسية', 'مقبلات', 'مشروبات', 'حلويات']);

  const prevOrdersCountRef = useRef(0);
  const ADMIN_EMAIL = 'qrmenu.app.dz@gmail.com';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        if (currentUser.email === ADMIN_EMAIL) {
          setActiveTab('admin');
        } else {
          let resDoc = await getDoc(doc(db, "restaurants", currentUser.uid));
          if (resDoc.exists()) {
            const resData = resDoc.data();
            if (resData.status !== 'active') {
              alert("حسابك قيد المراجعة أو في انتظار تأكيد الدفع عبر بريدي موب. يرجى التواصل مع الإدارة للتفعيل.");
              await signOut(auth);
              setUser(null);
              setCurrentRestaurantData(null);
              setActiveTab('owner');
              return;
            }
            setCurrentRestaurantData({ id: resDoc.id, ...resData });
            if (!restaurantParam) setSelectedRestaurantId(resDoc.id);
            setActiveTab('owner');
          } else {
            const q = query(collection(db, "restaurants"), where("ownerEmail", "==", currentUser.email));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              const docData = querySnapshot.docs[0];
              const resData = docData.data();
              if (resData.status !== 'active') {
                alert("حسابك قيد المراجعة أو في انتظار تأكيد الدفع عبر بريدي موب. يرجى التواصل مع الإدارة للتفعيل.");
                await signOut(auth);
                setUser(null);
                setCurrentRestaurantData(null);
                setActiveTab('owner');
                return;
              }
              setCurrentRestaurantData({ id: docData.id, ...resData });
              if (!restaurantParam) setSelectedRestaurantId(docData.id);
              setActiveTab('owner');
            }
          }
        }
      }
    });

    if (restaurantParam) {
      setSelectedRestaurantId(restaurantParam);
      setActiveTab('customer');
    }

    return () => unsubscribe();
  }, [restaurantParam]);

  const fetchRestaurants = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "restaurants"));
      const items: any[] = [];
      querySnapshot.forEach((document) => {
        items.push({ id: document.id, ...document.data() });
      });
      setRestaurants(items);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { 
    fetchRestaurants(); 
  }, []);

  useEffect(() => {
    if (!selectedRestaurantId) return;

    const currentRes = restaurants.find(r => r.id === selectedRestaurantId) || currentRestaurantData;
    if (currentRes && currentRes.categories) {
      setCustomCategories(currentRes.categories);
    }

    const qDishes = query(collection(db, "dishes"), where("restaurantId", "==", selectedRestaurantId));
    const unsubDishes = onSnapshot(qDishes, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      setDishes(items);
    });

    const qOrders = query(collection(db, "orders"), where("restaurantId", "==", selectedRestaurantId));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      const sortedOrders = items.sort((a,b) => b.createdAt - a.createdAt);
      
      if (sortedOrders.length > prevOrdersCountRef.current && user && user.email !== ADMIN_EMAIL) {
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(err => console.log("Audio play blocked", err));
        } catch (e) {
          console.error(e);
        }
      }
      prevOrdersCountRef.current = sortedOrders.length;
      setOrders(sortedOrders);
    });

    return () => {
      unsubDishes();
      unsubOrders();
    };
  }, [selectedRestaurantId, restaurants, currentRestaurantData, user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = userCredential.user;

        await setDoc(doc(db, "restaurants", newUser.uid), {
          name: restaurantNameInput,
          ownerEmail: email,
          phone: phoneInput,
          isOrderingActive: true,
          status: 'pending', 
          categories: ['أطباق رئيسية', 'مقبلات', 'مشروبات', 'حلويات'],
          createdAt: Date.now()
        });

        await signOut(auth);
        setUser(null);
        
        alert("تم إرسال طلبك بنجاح! حسابك الآن قيد الانتظار، يرجى التواصل معنا وتأكيد الدفع عبر بريدي موب لتفعيل حسابك.");
        setIsRegistering(false);
        setEmail('');
        setPassword('');
        setRestaurantNameInput('');
        setPhoneInput('');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      fetchRestaurants();
    } catch (error: any) {
      alert("خطأ: " + error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentRestaurantData(null);
    setActiveTab('customer');
  };

  const handleAddRestaurantByAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "restaurants"), {
        name: newRestaurantName,
        ownerEmail: ownerEmailForRes,
        phone: '',
        isOrderingActive: true,
        status: 'active',
        categories: ['أطباق رئيسية', 'مقبلات', 'مشروبات', 'حلويات'],
        createdAt: Date.now()
      });
      setNewRestaurantName('');
      setOwnerEmailForRes('');
      fetchRestaurants();
      alert("تمت إضافة المطعم بنجاح!");
    } catch (e: any) {
      alert("خطأ: " + e.message);
    }
  };

  const handleApproveRestaurant = async (restaurantId: string) => {
    try {
      await updateDoc(doc(db, "restaurants", restaurantId), { status: 'active' });
      fetchRestaurants();
      alert("تم تفعيل حساب المطعم بنجاح!");
    } catch (e: any) {
      alert("خطأ في التفعيل: " + e.message);
    }
  };

  const toggleRestaurantOrdering = async (restaurantId: string, currentState: boolean) => {
    try {
      const resRef = doc(db, "restaurants", restaurantId);
      await updateDoc(resRef, { isOrderingActive: !currentState });
      fetchRestaurants();
      if (currentRestaurantData) {
        setCurrentRestaurantData({...currentRestaurantData, isOrderingActive: !currentState});
      }
      alert("تم تحديث حالة الطلب بنجاح!");
    } catch (e: any) {
      alert("خطأ: " + e.message);
    }
  };

  const handleDeleteRestaurant = async (restaurantId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المطعم؟")) return;
    try {
      await deleteDoc(doc(db, "restaurants", restaurantId));
      fetchRestaurants();
      alert("تم حذف المطعم بنجاح!");
    } catch (e: any) {
      alert("خطأ: " + e.message);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveDish = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeResId = user?.email === ADMIN_EMAIL ? selectedRestaurantId : (currentRestaurantData?.id || user?.uid);
    if (!activeResId) return;

    try {
      const dishData = {
        restaurantId: activeResId,
        name,
        price: Number(price),
        desc,
        category,
        imageFile: imageFile || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c",
        isAvailable: isAvailable, 
        updatedAt: Date.now()
      };

      if (editingDishId) {
        await updateDoc(doc(db, "dishes", editingDishId), dishData);
        setEditingDishId(null);
      } else {
        await addDoc(collection(db, "dishes"), {
          ...dishData,
          createdAt: Date.now()
        });
      }

      setName('');
      setPrice('');
      setDesc('');
      setImageFile(null);
      setIsAvailable(true);
    } catch (e: any) {
      alert("خطأ: " + e.message);
    }
  };

  const startEditingDish = (dish: any) => {
    setEditingDishId(dish.id);
    setName(dish.name);
    setPrice(dish.price);
    setDesc(dish.desc);
    setCategory(dish.category);
    setImageFile(dish.imageFile);
    setIsAvailable(dish.isAvailable !== false);
  };

  const handleDeleteDish = async (dishId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الطبق؟")) return;
    try {
      await deleteDoc(doc(db, "dishes", dishId));
    } catch (e: any) {
      alert("خطأ في الحذف: " + e.message);
    }
  };

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + Number(item.price), 0);
  };

  const handleSendOrder = async () => {
    const currentRes = restaurants.find(r => r.id === selectedRestaurantId) || currentRestaurantData;
    if (currentRes && currentRes.isOrderingActive === false) {
      alert("عذراً، خدمة الطلب عبر الطاولة متوقفة حالياً من إدارة المطعم.");
      return;
    }
    if (cart.length === 0) {
      alert("السلة فارغة!");
      return;
    }
    if (!tableNumber) {
      alert("الرجاء إدخال رقم الطاولة!");
      return;
    }
    try {
      await addDoc(collection(db, "orders"), {
        restaurantId: selectedRestaurantId,
        items: cart,
        totalPrice: calculateTotal(),
        tableNumber,
        status: 'pending', // pending = قيد الانتظار, delivered = تم التوصيل
        createdAt: Date.now()
      });
      setCart([]);
      setTableNumber('');
      alert("تم إرسال طلبك بنجاح! بالصحة والراحة.");
    } catch (e: any) {
      alert("خطأ في إرسال الطلب: " + e.message);
    }
  };

  // دالة لتغيير حالة الطلب إلى "تم التوصيل"
  const handleMarkAsDelivered = async (orderId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'delivered' ? 'pending' : 'delivered';
      await updateDoc(doc(db, "orders", orderId), { status: newStatus });
    } catch (e: any) {
      alert("خطأ: " + e.message);
    }
  };

  const activeResForCustomer = restaurants.find(r => r.id === selectedRestaurantId) || currentRestaurantData;

  return (
    <main className="min-h-screen bg-gray-50 text-gray-800 p-4" dir="rtl">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #qr-section, #qr-section * {
            visibility: visible;
          }
          #qr-section {
            position: absolute;
            left: 50%;
            top: 40px;
            transform: translateX(-50%);
            width: 100%;
            text-align: center;
            border: none !important;
            box-shadow: none !important;
          }
          #print-btn {
            display: none !important;
          }
        }
      `}</style>

      <nav className="flex justify-between items-center bg-white p-4 shadow rounded-xl mb-6">
        <h1 className="text-xl font-bold text-orange-600">
          {activeResForCustomer && restaurantParam ? activeResForCustomer.name : 'منيو المطاعم الرقمي'}
        </h1>
        <div className="flex gap-2 items-center">
          {user ? (
            <div className="flex gap-2">
              {user.email === ADMIN_EMAIL && (
                <button 
                  onClick={() => setActiveTab(activeTab === 'admin' ? 'customer' : 'admin')} 
                  className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-bold"
                >
                  {activeTab === 'admin' ? 'لوحة المنيو' : 'لوحة تحكم الأدمن'}
                </button>
              )}
              <button onClick={handleLogout} className="bg-red-500 text-white px-3 py-2 rounded-lg text-sm font-bold">خروج</button>
            </div>
          ) : (
            <button onClick={() => setActiveTab('owner')} className="bg-orange-500 text-white px-3 py-2 rounded-lg text-sm font-bold">دخول / تسجيل أصحاب المطاعم</button>
          )}
        </div>
      </nav>

      {activeTab === 'admin' && user?.email === ADMIN_EMAIL && (
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="bg-white p-6 rounded-xl shadow border">
            <h2 className="text-xl font-bold mb-4 text-purple-700">إضافة مطعم جديد مباشرة</h2>
            <form onSubmit={handleAddRestaurantByAdmin} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="text" placeholder="اسم المطعم" value={newRestaurantName} onChange={(e) => setNewRestaurantName(e.target.value)} className="border p-2 rounded-lg" required />
              <input type="email" placeholder="البريد الإلكتروني لصاحب المطعم" value={ownerEmailForRes} onChange={(e) => setOwnerEmailForRes(e.target.value)} className="border p-2 rounded-lg" required />
              <button type="submit" className="bg-purple-600 text-white p-2 rounded-lg col-span-full font-bold">تسجيل وموافقة مباشرة</button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-xl shadow border">
            <h2 className="text-xl font-bold mb-4">إدارة المطاعم المشتركة ({restaurants.length})</h2>
            <div className="space-y-4">
              {restaurants.map(res => (
                <div key={res.id} className="border p-4 rounded-lg bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="font-bold text-lg text-orange-600">{res.name}</h3>
                    <p className="text-xs text-gray-500">المالك: {res.ownerEmail || 'غير محدد'}</p>
                    <p className="text-xs text-gray-700 font-bold mt-1">
                      الهاتف: <a href={`tel:${res.phone}`} className="text-blue-600 underline">{res.phone || 'غير مسجل'}</a>
                      {res.phone && (
                        <a href={`https://wa.me/213${res.phone.replace(/^0/, '')}`} target="_blank" rel="noopener noreferrer" className="mr-2 text-green-600">
                          💬 واتساب
                        </a>
                      )}
                    </p>
                    <p className="text-xs mt-1">
                      حالة الحساب: <span className={`font-bold ${res.status === 'active' ? 'text-green-600' : 'text-yellow-600'}`}>{res.status === 'active' ? 'مفعل ✅' : 'قيد الانتظار (في انتظار الدفع) ⏳'}</span>
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {res.status !== 'active' && (
                      <button onClick={() => handleApproveRestaurant(res.id)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                        تفعيل الحساب (تأكيد الدفع)
                      </button>
                    )}
                    <button onClick={() => toggleRestaurantOrdering(res.id, res.isOrderingActive !== false)} className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white ${res.isOrderingActive !== false ? 'bg-yellow-600' : 'bg-green-600'}`}>
                      {res.isOrderingActive !== false ? 'إيقاف الطلب' : 'تفعيل الطلب'}
                    </button>
                    <button onClick={() => { setSelectedRestaurantId(res.id); setActiveTab('customer'); }} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">عرض المنيو</button>
                    <button onClick={() => handleDeleteRestaurant(res.id)} className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">حذف</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'customer' && (
        <div>
          {!restaurantParam && user?.email !== ADMIN_EMAIL && !currentRestaurantData ? (
            <div className="max-w-xl mx-auto text-center bg-white p-10 rounded-2xl shadow border mt-20">
              <h2 className="text-3xl font-bold text-orange-600 mb-4">مرحباً بك في منصة المنيو الرقمي 🍽️</h2>
              <p className="text-gray-600 mb-6 text-lg">
                هذه المنصة مخصصة لتقديم قوائم الطعام الإلكترونية. لعرض منيو أي مطعم، يرجى مسح رمز الاستجابة السريعة (QR Code) الموجود على الطاولة.
              </p>
            </div>
          ) : (
            <div>
              {activeResForCustomer && activeResForCustomer.isOrderingActive === false && (
                <div className="bg-red-100 border-r-4 border-red-500 text-red-700 p-4 rounded-lg mb-4 text-center font-bold">
                  تنبيه: عذراً، خدمة الطلب المباشر من الطاولة متوقفة حالياً في هذا المطعم.
                </div>
              )}

              <div className="flex gap-2 overflow-x-auto pb-4 mb-4">
                <button onClick={() => setSelectedCategory('الكل')} className={`px-4 py-2 rounded-full text-sm font-medium ${selectedCategory === 'الكل' ? 'bg-orange-600 text-white' : 'bg-white shadow'}`}>الكل</button>
                {customCategories.map((cat) => (
                  <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-2 rounded-full text-sm font-medium ${selectedCategory === cat ? 'bg-orange-600 text-white' : 'bg-white shadow'}`}>{cat}</button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pb-28">
                {dishes
                  .filter(d => selectedCategory === 'الكل' || d.category === selectedCategory)
                  .map(dish => {
                    const isAvailable = dish.isAvailable !== false;
                    return (
                      <div key={dish.id} className={`bg-white p-4 rounded-xl shadow border relative ${!isAvailable ? 'opacity-70 bg-gray-100' : ''}`}>
                        {!isAvailable && (
                          <div className="absolute top-4 left-4 bg-red-600 text-white text-xs px-2 py-1 rounded-md font-bold z-10">
                            نفذت الكمية ❌
                          </div>
                        )}
                        <img src={dish.imageFile} alt={dish.name} className="w-full h-40 object-cover rounded-lg mb-3" />
                        <h3 className="font-bold text-lg">{dish.name}</h3>
                        <p className="text-gray-500 text-sm mb-2">{dish.desc}</p>
                        <div className="flex justify-between items-center mt-4">
                          <span className="text-orange-600 font-bold">{dish.price} DA</span>
                          {activeResForCustomer?.isOrderingActive !== false && isAvailable && (
                            <button onClick={() => setCart([...cart, dish])} className="bg-orange-600 text-white px-3 py-1.5 rounded-lg text-sm">إضافة للطلب +</button>
                          )}
                        </div>
                      </div>
                    );
                })}
              </div>

              {cart.length > 0 && activeResForCustomer?.isOrderingActive !== false && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg z-50">
                  <div className="max-w-xl mx-auto flex flex-col gap-2">
                    <div className="flex justify-between items-center font-bold text-md">
                      <span>سلة الطلبات ({cart.length} منتجات)</span>
                      <span className="text-orange-600">المجموع: {calculateTotal()} DA</span>
                    </div>
                    <input type="text" placeholder="رقم الطاولة (مثال: 05)" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} className="border p-2 rounded-lg text-sm" />
                    <button onClick={handleSendOrder} className="bg-green-600 text-white p-2 rounded-lg font-bold">تأكيد وإرسال الطلب ({calculateTotal()} DA)</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'owner' && !user && (
        <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow border mt-10">
          <h2 className="text-xl font-bold mb-4 text-center text-orange-600">
            {isRegistering ? 'إنشاء حساب مطعم جديد' : 'تسجيل دخول صاحب المطعم'}
          </h2>
          <form onSubmit={handleAuth} className="flex flex-col gap-3">
            {isRegistering && (
              <>
                <input type="text" placeholder="اسم المطعم" value={restaurantNameInput} onChange={(e) => setRestaurantNameInput(e.target.value)} className="border p-2 rounded-lg" required />
                <input type="tel" placeholder="رقم الهاتف (للتواصل عبر بريدي موب)" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} className="border p-2 rounded-lg" required />
              </>
            )}
            <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} className="border p-2 rounded-lg" required />
            <input type="password" placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} className="border p-2 rounded-lg" required />
            <button type="submit" className="bg-orange-600 text-white p-2 rounded-lg font-bold">
              {isRegistering ? 'تسجيل المطعم وإرسال طلب الاشتراك' : 'دخول'}
            </button>
            <button type="button" onClick={() => setIsRegistering(!isRegistering)} className="text-sm text-blue-600 mt-2 underline">
              {isRegistering ? 'لديك حساب بالفعل؟ سجل الدخول هنا' : 'لا تملك حساباً؟ أنشئ مطعماً جديداً الآن'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'owner' && user && user.email !== ADMIN_EMAIL && (
        <div className="space-y-6 max-w-4xl mx-auto">
          {currentRestaurantData && (
            <div id="qr-section" className="bg-white p-6 rounded-xl shadow border flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-orange-600 mb-1">مرحباً بك في لوحة تحكم: {currentRestaurantData.name}</h2>
                <p className="text-sm text-gray-500 mb-4">هذا هو رمز الاستجابة السريعة (QR Code) الخاص بمطعمك حصرياً. قم بطباعته ووضعه على الطاولات.</p>
                <button id="print-btn" onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm">🖨️ طباعة الـ QR Code</button>
              </div>
              <div className="bg-white p-4 border rounded-xl shadow-inner flex flex-col items-center">
                <QRCodeSVG value={`${window.location.origin}/?restaurant=${currentRestaurantData.id}`} size={140} />
                <span className="text-xs text-gray-500 mt-2 font-bold">{currentRestaurantData.name}</span>
              </div>
            </div>
          )}

          <div className="bg-white p-6 rounded-xl shadow border">
            <h2 className="text-xl font-bold mb-4 text-orange-600">
              {editingDishId ? '✏️ تعديل بيانات الطبق' : '➕ إضافة طبق جديد للمنيو'}
            </h2>
            <form onSubmit={handleSaveDish} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="text" placeholder="اسم الطبق" value={name} onChange={(e) => setName(e.target.value)} className="border p-2 rounded-lg" required />
              <input type="number" placeholder="السعر (DA)" value={price} onChange={(e) => setPrice(e.target.value)} className="border p-2 rounded-lg" required />
              <input type="text" placeholder="الوصف" value={desc} onChange={(e) => setDesc(e.target.value)} className="border p-2 rounded-lg" />
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="border p-2 rounded-lg">
                {customCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              
              <div className="col-span-full flex items-center gap-3 bg-gray-50 p-3 rounded-lg border">
                <input 
                  type="checkbox" 
                  id="isAvailableCheck" 
                  checked={isAvailable} 
                  onChange={(e) => setIsAvailable(e.target.checked)} 
                  className="w-5 h-5 text-orange-600 rounded"
                />
                <label htmlFor="isAvailableCheck" className="text-sm font-bold cursor-pointer">
                  الطبق متوفر حالياً (إذا أزلته سيظهر للزبائن أنه "نافذ")
                </label>
              </div>

              <div className="col-span-full border border-dashed border-gray-400 p-3 rounded-lg flex flex-col items-center justify-center gap-2 bg-gray-50">
                <span className="text-xs text-gray-600 font-bold">صورة الطبق (اختر من المعرض أو صور مباشرة بالكاميرا 📷):</span>
                <input type="file" accept="image/*" capture="environment" onChange={handleImageChange} className="text-xs" />
                {imageFile && <img src={imageFile} alt="Preview" className="w-20 h-20 object-cover rounded-md mt-2 border" />}
              </div>

              <div className="col-span-full flex gap-2">
                <button type="submit" className="flex-1 bg-orange-600 text-white p-2 rounded-lg font-bold">{editingDishId ? 'حفظ التعديلات' : 'إضافة الطبق للقائمة'}</button>
                {editingDishId && (
                  <button type="button" onClick={() => { setEditingDishId(null); setName(''); setPrice(''); setDesc(''); setImageFile(null); setIsAvailable(true); }} className="bg-gray-400 text-white px-4 py-2 rounded-lg font-bold">إلغاء</button>
                )}
              </div>
            </form>
          </div>

          <div className="bg-white p-6 rounded-xl shadow border">
            <h2 className="text-xl font-bold mb-4">قائمة أطباق مطعمك ({dishes.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {dishes.map(dish => {
                const isAvailable = dish.isAvailable !== false;
                return (
                  <div key={dish.id} className="border p-3 rounded-xl bg-gray-50 flex gap-3 items-center justify-between">
                    <div className="flex gap-3 items-center">
                      <img src={dish.imageFile} alt={dish.name} className="w-16 h-16 object-cover rounded-lg" />
                      <div>
                        <h4 className="font-bold">{dish.name}</h4>
                        <p className="text-xs text-gray-500">{dish.category}</p>
                        <p className="text-sm font-bold text-orange-600">{dish.price} DA</p>
                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${isAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {isAvailable ? 'متوفر' : 'نافذ ❌'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => startEditingDish(dish)} className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold">تعديل</button>
                      <button onClick={() => handleDeleteDish(dish.id)} className="bg-red-600 text-white px-3 py-1 rounded text-xs font-bold">حذف</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow border">
            <h2 className="text-xl font-bold mb-4">الطلبات الواردة لطاولاتك ({orders.length})</h2>
            <div className="space-y-3">
              {orders.map(order => {
                const isDelivered = order.status === 'delivered';
                return (
                  <div key={order.id} className={`border p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${isDelivered ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}>
                    <div>
                      <p className="font-bold text-lg">طاولة رقم: {order.tableNumber}</p>
                      <p className="text-sm text-gray-600">المنتجات: {order.items.map((i: any) => i.name).join(', ')}</p>
                      <p className="text-sm font-bold text-orange-600 mt-1">المجموع: {order.totalPrice || order.items.reduce((sum: number, i: any) => sum + Number(i.price), 0)} DA</p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${isDelivered ? 'bg-green-200 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {isDelivered ? 'تم التوصيل للزبون ✅' : 'قيد الانتظار ⏳'}
                      </span>
                      <button 
                        onClick={() => handleMarkAsDelivered(order.id, order.status)} 
                        className={`px-4 py-2 rounded-lg text-xs font-bold text-white ${isDelivered ? 'bg-gray-500 hover:bg-gray-600' : 'bg-green-600 hover:bg-green-700'}`}
                      >
                        {isDelivered ? 'إعادة كقيد الانتظار' : 'تم التوصيل (هبط الطبق) 🍽️'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="text-center mt-20 font-bold">جاري التحميل...</div>}>
      <MainApp />
    </Suspense>
  );
}
