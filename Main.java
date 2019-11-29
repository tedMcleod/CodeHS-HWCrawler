import java.awt.*;
import java.awt.event.ItemEvent;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.regex.Pattern;
import javax.swing.*;

public class Main {
    public static void main(String[] args) {


        JFrame f = new JFrame();//creating instance of JFrame

        JLabel label_title = new JLabel("Get CodeHS HW Stats");
        label_title.setFont(new Font(label_title.getName(), Font.PLAIN, 25));
        label_title.setBounds(50, 60, 300, 40);

        JLabel label_assignments = new JLabel("Assignment names (a, b, c, ...)");
        label_assignments.setBounds(55, 115, 300, 40);
        JTextField textField_assignments = new JTextField();
        textField_assignments.setBounds(50, 150, 300, 40);

        JLabel label_dueDate = new JLabel("Due date/time (MM/DD/YY HH:MM)");
        label_dueDate.setBounds(55, 195, 300, 40);
        JTextField textField_dueDate = new JTextField();
        textField_dueDate.setBounds(50, 230, 300, 40);

        JCheckBox checkBox_allPeriods = new JCheckBox("All periods?", true);
        checkBox_allPeriods.setBounds(50, 280, 200, 50);
        checkBox_allPeriods.addItemListener(e -> {
            if (e.getStateChange() != ItemEvent.SELECTED) {
                JOptionPane.showMessageDialog(f, "Individual classes option is not supported yet.");
                //TODO: Add option for choosing teacher/class
            }
        });

        JButton button_run = new JButton("run");//creating instance of JButton
        button_run.setBounds(50, 370, 100, 40);//x axis, y axis, width, height

        f.add(label_title);
        f.add(label_assignments);
        f.add(textField_assignments);
        f.add(label_dueDate);
        f.add(textField_dueDate);
        f.add(checkBox_allPeriods);
        f.add(button_run);//adding button in JFrame

        f.setSize(400, 550);
        f.setLayout(null);//using no layout managers
        f.setVisible(true);//making the frame visible
        f.addWindowListener(new WindowAdapter() {
            public void windowClosing(WindowEvent e) {
                System.exit(0);
            }
        });
        button_run.addActionListener(e -> {
            String assignments = textField_assignments.getText().trim() + ",";
            if (!Pattern.matches("^ *([a-zA-Z ]+, *)+\\s*", assignments)) {
                JOptionPane.showMessageDialog(f, "Assignment list is in the wrong format!");
                return;
            }


            if (!Pattern.matches("^ *(\\d{1,2} */ *){2}(\\d{2}|\\d{4}) *\\d{1,2} *: *\\d{1,2}\\s*", textField_dueDate.getText().trim())) {
                JOptionPane.showMessageDialog(f, "Due date is in the wrong format!");
                return;
            }

            //close windows
            Container frame = button_run.getParent();
            do
                frame = frame.getParent();
            while (!(frame instanceof JFrame));
            ((JFrame) frame).dispose();

            String commandLineArguments = " ";
            commandLineArguments += textField_dueDate.getText().trim() + " ";
            commandLineArguments += encodeAssignments(assignments) + " ";
            commandLineArguments += "2 m0 s0"; //two items, m0 -> ***REMOVED*** all periods, s0 ***REMOVED*** all periods
            try {
                final Process p = Runtime.getRuntime().exec("node index.js" + commandLineArguments);
                new Thread(() -> {
                    BufferedReader input = new BufferedReader(new InputStreamReader(p.getInputStream()));
                    String line;
                    try {
                        while ((line = input.readLine()) != null)
                            System.out.println(line);
                    } catch (IOException ioe) {
                        ioe.printStackTrace();
                    }
                }).start();
                p.waitFor();
            } catch (InterruptedException | IOException ex) {
                ex.printStackTrace();
            }
        });
    }

    private static String encodeAssignments(String raw){
        String[] split = raw.split(",");
        StringBuilder newS = new StringBuilder();

        int count = 0;
        for (String s : split) {
            if(s.trim().length() != 0){
                count++;
                newS.append(" ").append(s.trim());
            }
        }

        return "" + count + "" + newS.toString();
    }
}