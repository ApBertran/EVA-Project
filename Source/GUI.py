import tkinter
import customtkinter
import os
from PIL import Image
import serial

# Setup the Serial Object
ser = serial.Serial()
# Set the Serial Port to use
ser.setPort("COM3")
# Set the Baudrate
ser.baudrate = 57600
# Open the Serial Connection
ser.open()

class App(customtkinter.CTk):
    def __init__(self):
        super().__init__()

        # LED Values
        redRGB = 0
        greenRGB = 0
        blueRGB = 0
        ledOn = False
        
        self.title("EVA Project")
        self.geometry("1920x1080")

        # set grid layout 1x2
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=1)

        # load images with light and dark mode image
        self.logo_image = customtkinter.CTkImage(Image.open("Images/IMG_8320.JPG"), size=(26, 26))
        self.large_test_image = customtkinter.CTkImage(Image.open("Images/IMG_8320.JPG"), size=(500, 150))
        self.image_icon_image = customtkinter.CTkImage(Image.open("Images/IMG_8320.JPG"), size=(20, 20))
        self.home_image = customtkinter.CTkImage(light_image=Image.open("Images/IMG_8320.JPG"),
                                                 dark_image=Image.open("Images/IMG_8320.JPG"), size=(100, 100))
        self.chat_image = customtkinter.CTkImage(light_image=Image.open("Images/IMG_8320.JPG"),
                                                 dark_image=Image.open("Images/IMG_8320.JPG"), size=(100, 100))
        self.add_user_image = customtkinter.CTkImage(light_image=Image.open("Images/IMG_8320.JPG"),
                                                     dark_image=Image.open("Images/IMG_8320.JPG"), size=(100, 100))
        self.volume_image = customtkinter.CTkImage(light_image=Image.open("Images/IMG_8320.JPG"),
                                                     dark_image=Image.open("Images/IMG_8320.JPG"), size=(75, 75))
        

        # create navigation frame
        self.navigation_frame = customtkinter.CTkFrame(self, corner_radius=0)
        self.navigation_frame.grid(row=0, column=0, sticky="nsew")
        self.navigation_frame.grid_rowconfigure(4, weight=1)

        self.navigation_frame_label = customtkinter.CTkLabel(self.navigation_frame, text="EVA Project",
                                                             compound="left", font=customtkinter.CTkFont(size=15, weight="bold"))
        self.navigation_frame_label.grid(row=0, column=0, padx=10, pady=10)

        self.home_button = customtkinter.CTkButton(self.navigation_frame, corner_radius=0, height=40, border_spacing=10, text="",
                                                   fg_color="transparent", text_color=("gray10", "gray90"), hover_color=("gray70", "gray30"),
                                                   image=self.home_image, command=self.home_button_event)
        self.home_button.grid(row=1, column=0, sticky="ew")

        self.led_frame_button = customtkinter.CTkButton(self.navigation_frame, corner_radius=0, height=40, border_spacing=10, text="",
                                                      fg_color="transparent", text_color=("gray10", "gray90"), hover_color=("gray70", "gray30"),
                                                      image=self.chat_image, command=self.led_frame_button_event)
        self.led_frame_button.grid(row=2, column=0, sticky="ew")

        self.frame_3_button = customtkinter.CTkButton(self.navigation_frame, corner_radius=0, height=40, border_spacing=10, text="",
                                                      fg_color="transparent", text_color=("gray10", "gray90"), hover_color=("gray70", "gray30"),
                                                      image=self.add_user_image, command=self.frame_3_button_event)
        self.frame_3_button.grid(row=3, column=0, sticky="ew")

        self.volume_slider = customtkinter.CTkSlider(self.navigation_frame, orientation="vertical", width=40)
        self.volume_slider.grid(row=5, column=0, rowspan=1, padx=(10, 10), pady=(10, 10), sticky="ns")
        
        self.insert_volume_image = customtkinter.CTkLabel(self.navigation_frame, image=self.volume_image, text="")
        self.insert_volume_image.grid(row=6, column=0, padx=(10,10), pady=(10,10), sticky="ew")

        # create home frame
        self.home_frame = customtkinter.CTkFrame(self, corner_radius=0, fg_color="transparent")
        self.home_frame.grid_columnconfigure(0, weight=1)

        self.home_frame_large_image_label = customtkinter.CTkLabel(self.home_frame, text="", image=self.large_test_image)
        self.home_frame_large_image_label.grid(row=0, column=0, padx=20, pady=10)

        self.home_frame_button_1 = customtkinter.CTkButton(self.home_frame, text="", image=self.image_icon_image)
        self.home_frame_button_1.grid(row=1, column=0, padx=20, pady=10)
        self.home_frame_button_2 = customtkinter.CTkButton(self.home_frame, text="CTkButton", image=self.image_icon_image, compound="right")
        self.home_frame_button_2.grid(row=2, column=0, padx=20, pady=10)
        self.home_frame_button_3 = customtkinter.CTkButton(self.home_frame, text="CTkButton", image=self.image_icon_image, compound="top")
        self.home_frame_button_3.grid(row=3, column=0, padx=20, pady=10)
        self.home_frame_button_4 = customtkinter.CTkButton(self.home_frame, text="CTkButton", image=self.image_icon_image, compound="bottom", anchor="w")
        self.home_frame_button_4.grid(row=4, column=0, padx=20, pady=10)

        # create LED control frame
        self.led_frame = customtkinter.CTkFrame(self, corner_radius=0, fg_color="transparent")
        self.led_frame.grid_columnconfigure(2, weight=1)
        self.led_frame.grid_rowconfigure(2, weight=1)
        
        self.led_frame_text_label = customtkinter.CTkLabel(self.led_frame, text="LED Control", font=customtkinter.CTkFont(size=60, weight="bold"))
        self.led_frame_text_label.grid(row=0, column=1, padx=20, pady=10, sticky="n")
        
        self.led_frame_switch = customtkinter.CTkSwitch(self.led_frame, switch_width=150, switch_height=75, text="", command=self.led_switch)
        self.led_frame_switch.grid(row=1, column=1, pady=10, padx=20, sticky="n")
        
        self.led_frame_r_slider = customtkinter.CTkSlider(self.led_frame, orientation="vertical", width=75, progress_color="red", button_color="white", button_hover_color="gray", from_=0, to=255, number_of_steps=255, command=self.pass_red_led)
        self.led_frame_r_slider.grid(row=2, column=0, rowspan=1, padx=250, pady=10, sticky="ns")
        
        self.led_frame_g_slider = customtkinter.CTkSlider(self.led_frame, orientation="vertical", width=75, progress_color="green", button_color="white", button_hover_color="gray", from_=0, to=255, number_of_steps=255, command=self.pass_green_led)
        self.led_frame_g_slider.grid(row=2, column=1, rowspan=1, padx=200, pady=10, sticky="ns")
        
        self.led_frame_b_slider = customtkinter.CTkSlider(self.led_frame, orientation="vertical", width=75, progress_color="blue", button_color="white", button_hover_color="gray", from_=0, to=255, number_of_steps=255, command=self.pass_blue_led)
        self.led_frame_b_slider.grid(row=2, column=2, rowspan=1, padx=150, pady=10, sticky="ns")

        # create third frame
        self.third_frame = customtkinter.CTkFrame(self, corner_radius=0, fg_color="transparent")

        # select default frame
        self.select_frame_by_name("home")

    def select_frame_by_name(self, name):
        # set button color for selected button
        self.home_button.configure(fg_color=("gray75", "gray25") if name == "home" else "transparent")
        self.led_frame_button.configure(fg_color=("gray75", "gray25") if name == "led_frame" else "transparent")
        self.frame_3_button.configure(fg_color=("gray75", "gray25") if name == "frame_3" else "transparent")

        # show selected frame
        if name == "home":
            self.home_frame.grid(row=0, column=1, sticky="nsew")
        else:
            self.home_frame.grid_forget()
        if name == "led_frame":
            self.led_frame.grid(row=0, column=1, sticky="nsew")
        else:
            self.led_frame.grid_forget()
        if name == "frame_3":
            self.third_frame.grid(row=0, column=1, sticky="nsew")
        else:
            self.third_frame.grid_forget()

    def home_button_event(self):
        self.select_frame_by_name("home")

    def led_frame_button_event(self):
        self.select_frame_by_name("led_frame")

    def frame_3_button_event(self):
        self.select_frame_by_name("frame_3")

    def change_appearance_mode_event(self, new_appearance_mode):
        customtkinter.set_appearance_mode(new_appearance_mode)
    
    # Receive slider values for LED
    def pass_red_led(self, value):
        #print(f"R: {value}")
        self.change_colors()
    def pass_green_led(self, value):
        #print(f"G: {value}")
        self.change_colors()
    def pass_blue_led(self, value):
        #print(f"B: {value}")
        self.change_colors()
    def led_switch(self):
        print("Lights toggled")
        self.change_colors()
    
    # Changes the colors, needs to be called from all of the pass color functions and the switch, should be an if statement to start
    def change_colors(self):
        if self.led_frame_switch.get() == 1:
            self.redRGB = int(self.led_frame_r_slider.get())
            self.greenRGB = int(self.led_frame_g_slider.get())
            self.blueRGB = int(self.led_frame_b_slider.get())
            print(f"R: {self.redRGB} G: {self.greenRGB} B: {self.blueRGB}")
            ser.write(bytes("r" + chr(self.redRGB), 'utf-8'))
            ser.write(bytes("g" + chr(self.greenRGB), 'utf-8'))
            ser.write(bytes("b" + chr(self.blueRGB), 'utf-8'))
        else:
            self.redRGB = 0
            self.greenRGB = 0
            self.blueRGB = 0

if __name__ == "__main__":
    app = App()
    app.mainloop()
